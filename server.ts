import express from "express";
import { createServer as createViteServer } from "vite";
import session from "express-session";
import cookieParser from "cookie-parser";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust proxy is required for secure cookies behind AI Studio's reverse proxy
  app.set("trust proxy", 1);

  app.use(express.json());
  app.use(cookieParser());
  
  // Important for AI Studio iframe: SameSite=None and Secure
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "fitbit-dashboard-secret",
      resave: false, // Changed back to false for better performance with memory store
      saveUninitialized: true,
      proxy: true,
      name: "fitbit.sid",
      cookie: {
        secure: true,
        sameSite: "none",
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    })
  );

  // Debug middleware to track sessions
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      console.log(`[Session Debug] Path: ${req.path}, ID: ${req.sessionID}, HasTokens: ${!!(req.session as any).fitbitTokens}`);
    }
    next();
  });

  const getFitbitConfig = () => ({
    clientId: process.env.FITBIT_CLIENT_ID,
    clientSecret: process.env.FITBIT_CLIENT_SECRET,
    appUrl: process.env.APP_URL?.replace(/\/$/, "") // Remove trailing slash if exists
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Fitbit Auth URL
  app.get("/api/auth/url", (req, res) => {
    const { clientId, appUrl } = getFitbitConfig();
    if (!clientId) {
      return res.status(500).json({ error: "FITBIT_CLIENT_ID not configured" });
    }

    const redirectUri = `${appUrl}/auth/callback`;
    const scope = "activity heartrate location nutrition profile settings sleep social weight";
    const authUrl = `https://www.fitbit.com/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=${encodeURIComponent(scope)}&expires_in=604800`;

    res.json({ url: authUrl });
  });

  // Fitbit Callback
  app.get("/auth/callback", async (req, res) => {
    const { code } = req.query;
    const { clientId, clientSecret, appUrl } = getFitbitConfig();
    
    if (!code) return res.status(400).send("No code provided");

    try {
      const redirectUri = `${appUrl}/auth/callback`;
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

      const response = await axios.post(
        "https://api.fitbit.com/oauth2/token",
        new URLSearchParams({
          code: code as string,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
        {
          headers: {
            Authorization: `Basic ${basicAuth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const tokens = response.data;
      // Store in session as well for backup
      (req.session as any).fitbitTokens = tokens;

      res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #000; color: #fff;">
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS', 
                  tokens: ${JSON.stringify(tokens)} 
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <div style="text-align: center;">
              <h2>Conexión Exitosa</h2>
              <p>Sincronizando con el dashboard...</p>
            </div>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Fitbit token exchange error:", error.response?.data || error.message);
      res.status(500).send("Error authenticating with Fitbit");
    }
  });

  // Helper to get token from header or session
  const getTokens = (req: express.Request) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        return JSON.parse(Buffer.from(authHeader.split(' ')[1], 'base64').toString());
      } catch (e) {
        return null;
      }
    }
    return (req.session as any).fitbitTokens;
  };

  // Fitbit Data Proxy
  app.get("/api/fitbit/:endpoint(*)", async (req, res) => {
    let tokens = getTokens(req);
    if (!tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const endpoint = req.params.endpoint;
    const isTcx = endpoint.endsWith('.tcx');
    
    // Reconstruct query string
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      queryParams.append(key, value as string);
    }
    const queryString = queryParams.toString();
    
    // Use version 1.1 for TCX, 1.2 for activity list, version 1 for others
    let apiVersion = '1';
    if (isTcx) {
      apiVersion = '1.1';
    } else if (endpoint.includes('activities/list')) {
      apiVersion = '1.2';
    }
    
    const url = isTcx 
      ? `https://api.fitbit.com/${apiVersion}/user/-/${endpoint}${queryString ? '?' + queryString : ''}`
      : `https://api.fitbit.com/${apiVersion}/user/-/${endpoint}.json${queryString ? '?' + queryString : ''}`;

    console.log(`[Fitbit Proxy] Calling: ${url}`);

    const makeRequest = async (tokenToUse: string) => {
      return axios.get(url, {
        headers: {
          Authorization: `Bearer ${tokenToUse}`,
        },
        responseType: isTcx ? 'text' : 'json'
      });
    };

    try {
      let response;
      try {
        response = await makeRequest(tokens.access_token);
      } catch (error: any) {
        // If 401, try to refresh token
        if (error.response?.status === 401 && tokens.refresh_token) {
          console.log("[Fitbit Proxy] Access token expired, attempting refresh...");
          const { clientId, clientSecret } = getFitbitConfig();
          const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
          
          try {
            const refreshResponse = await axios.post(
              "https://api.fitbit.com/oauth2/token",
              new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: tokens.refresh_token,
              }),
              {
                headers: {
                  Authorization: `Basic ${basicAuth}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
              }
            );
            
            tokens = refreshResponse.data;
            console.log("[Fitbit Proxy] Token refreshed successfully");
            
            // Update session if available
            if (req.session) {
              (req.session as any).fitbitTokens = tokens;
            }
            
            // Retry original request with new token
            response = await makeRequest(tokens.access_token);
            
            // Add refreshed tokens to response headers so client can update localStorage
            res.set('X-Fitbit-New-Tokens', Buffer.from(JSON.stringify(tokens)).toString('base64'));
          } catch (refreshError: any) {
            console.error("[Fitbit Proxy] Refresh token failed:", refreshError.response?.data || refreshError.message);
            // If refresh fails, the user must re-authenticate
            return res.status(401).json({ 
              error: "refresh_token_failed", 
              message: "Tu sesión de Fitbit ha expirado. Por favor, vuelve a conectar.",
              details: refreshError.response?.data
            });
          }
        } else {
          throw error;
        }
      }
      
      console.log(`[Fitbit Proxy] Success: ${endpoint} (Status: ${response.status})`);
      
      if (isTcx) {
        res.set('Content-Type', 'text/xml');
        return res.send(response.data);
      }
      
      res.json(response.data);
    } catch (error: any) {
      const status = error.response?.status || 500;
      const errorData = error.response?.data;
      console.error(`[Fitbit Proxy] API Error (${endpoint}) [${status}]:`, JSON.stringify(errorData || error.message));
      
      res.status(status).json(errorData || { error: "API Error", message: error.message });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  // Check Auth Status
  app.get("/api/auth/status", (req, res) => {
    res.json({ authenticated: !!(req.session as any).fitbitTokens });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
