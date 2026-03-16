import React, { useState, useEffect, useMemo, Component } from 'react';
import { 
  Activity, 
  Moon, 
  Heart, 
  Zap, 
  User, 
  LogOut, 
  RefreshCw,
  ChevronRight,
  TrendingUp,
  Calendar,
  Clock,
  Map as MapIcon,
  List,
  BarChart3,
  ChevronLeft,
  MapPin,
  ExternalLink
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  BarChart,
  Bar
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet icon issue
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// --- Types ---
interface FitbitProfile {
  user: {
    displayName: string;
    avatar: string;
    fullName: string;
    gender: string;
    age: number;
    height: number;
    weight: number;
  };
}

interface ActivityData {
  summary: {
    steps: number;
    caloriesOut: number;
    distances: { activity: string; distance: number }[];
    fairlyActiveMinutes: number;
    lightlyActiveMinutes: number;
    veryActiveMinutes: number;
    sedentaryMinutes: number;
  };
  goals: {
    steps: number;
    caloriesOut: number;
  };
}

interface HeartRateData {
  'activities-heart': {
    dateTime: string;
    value: {
      customHeartRateZones: any[];
      heartRateZones: {
        caloriesOut: number;
        max: number;
        min: number;
        minutes: number;
        name: string;
      }[];
      heartRateZoneData?: any;
      restingHeartRate: number;
    };
  }[];
}

interface ActivityLog {
  activeDuration: number;
  activityName: string;
  activityTypeId: number;
  averageHeartRate: number;
  calories: number;
  duration: number;
  elevationGain: number;
  hasStartTime: boolean;
  isFavorite: boolean;
  lastModified: string;
  logId: number;
  name: string;
  startDate: string;
  startTime: string;
  steps: number;
  source: { id: string; name: string; type: string };
  distance?: number;
  distanceUnit?: string;
  tcxLink?: string;
}

interface MapPoint {
  lat: number;
  lng: number;
  time?: string;
}

interface TimeSeriesData {
  'activities-steps': {
    dateTime: string;
    value: string;
  }[];
}

// --- Components ---

const MapModal = ({ activity, onClose, headers }: { activity: ActivityLog, onClose: () => void, headers: any }) => {
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTcx = async () => {
      try {
        // Extract path from tcxLink: https://api.fitbit.com/1.2/user/-/activities/12345.tcx -> activities/12345.tcx
        const path = activity.tcxLink?.split('/user/-/')[1];
        if (!path) throw new Error('Invalid TCX link');

        const res = await fetch(`/api/fitbit/${path}`, { headers });
        const tcxText = await res.text();

        // Simple TCX parsing using DOMParser
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(tcxText, "text/xml");
        const trackpoints = xmlDoc.getElementsByTagName("Trackpoint");
        
        const parsedPoints: MapPoint[] = [];
        for (let i = 0; i < trackpoints.length; i++) {
          const tp = trackpoints[i];
          const lat = tp.getElementsByTagName("LatitudeDegrees")[0]?.textContent;
          const lng = tp.getElementsByTagName("LongitudeDegrees")[0]?.textContent;
          if (lat && lng) {
            parsedPoints.push({ lat: parseFloat(lat), lng: parseFloat(lng) });
          }
        }
        setPoints(parsedPoints);
      } catch (err) {
        console.error('Error fetching/parsing TCX:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTcx();
  }, [activity]);

  const center = points.length > 0 ? [points[0].lat, points[0].lng] : [0, 0];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-900 border border-zinc-800 w-full max-w-4xl rounded-3xl overflow-hidden flex flex-col h-[80vh]"
      >
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <MapIcon className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h3 className="font-bold text-white">{activity.activityName}</h3>
              <p className="text-xs text-zinc-500">{activity.startDate} • {activity.startTime}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white"
          >
            <ChevronLeft className="w-6 h-6 rotate-180" />
          </button>
        </div>

        <div className="flex-1 relative bg-zinc-950">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
              <p className="text-zinc-500 text-sm">Cargando mapa de ruta...</p>
            </div>
          ) : points.length > 0 ? (
            <MapContainer 
              center={center as [number, number]} 
              zoom={15} 
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Polyline positions={points.map(p => [p.lat, p.lng])} color="#10b981" weight={4} opacity={0.8} />
              <Marker position={center as [number, number]}>
                <Popup>Inicio de {activity.activityName}</Popup>
              </Marker>
              <Marker position={[points[points.length-1].lat, points[points.length-1].lng] as [number, number]}>
                <Popup>Fin de {activity.activityName}</Popup>
              </Marker>
            </MapContainer>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <MapPin className="w-12 h-12 text-zinc-800" />
              <p className="text-zinc-500">No se pudieron cargar las coordenadas de esta actividad.</p>
            </div>
          )}
        </div>

        <div className="p-6 bg-zinc-900/50 border-t border-zinc-800 grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-1">Distancia</p>
            <p className="text-lg font-bold text-white">{activity.distance?.toFixed(2)} km</p>
          </div>
          <div className="text-center">
            <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-1">Duración</p>
            <p className="text-lg font-bold text-white">{(activity.duration / 60000).toFixed(0)} min</p>
          </div>
          <div className="text-center">
            <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-1">Ritmo Medio</p>
            <p className="text-lg font-bold text-white">
              {activity.distance ? ((activity.duration / 60000) / activity.distance).toFixed(2) : '--'} min/km
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const StatCard = ({ title, value, unit, icon: Icon, color, trend }: any) => {
  if (!Icon) return null;
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl backdrop-blur-sm"
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-2xl ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
        {trend && (
          <div className="flex items-center gap-1 text-emerald-500 text-xs font-bold bg-emerald-500/10 px-2 py-1 rounded-full">
            <TrendingUp className="w-3 h-3" />
            {trend}
          </div>
        )}
      </div>
      <div>
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">{title}</p>
        <div className="flex items-baseline gap-2">
          <h3 className="text-3xl font-bold text-white tracking-tight">{value}</h3>
          <span className="text-zinc-500 text-sm font-medium">{unit}</span>
        </div>
      </div>
    </motion.div>
  );
};

const ChartContainer = ({ title, icon: Icon, children }: any) => (
  <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl backdrop-blur-sm">
    <div className="flex items-center gap-3 mb-8">
      <div className="p-2 bg-zinc-800 rounded-lg">
        <Icon className="w-5 h-5 text-zinc-400" />
      </div>
      <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
    </div>
    <div className="h-[300px] w-full">
      {children}
    </div>
  </div>
);

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children: React.ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}
class ErrorBoundary extends Component<any, any> {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error('[ErrorBoundary] caught error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 text-center">
          <Activity className="w-16 h-16 text-rose-500 mb-6" />
          <h1 className="text-3xl font-bold mb-4">Algo salió mal</h1>
          <p className="text-zinc-400 mb-8 max-w-md">
            La aplicación encontró un error inesperado al procesar los datos de Fitbit.
          </p>
          <pre className="bg-zinc-900 p-4 rounded-xl text-xs text-rose-400 mb-8 overflow-auto max-w-full">
            {this.state.error?.message || 'Error desconocido'}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            className="bg-emerald-500 text-black px-6 py-3 rounded-xl font-bold"
          >
            Recargar Aplicación
          </button>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<FitbitProfile | null>(null);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [heartRate, setHeartRate] = useState<HeartRateData | null>(null);
  const [activitiesList, setActivitiesList] = useState<ActivityLog[]>([]);
  const [historyData, setHistoryData] = useState<TimeSeriesData | null>(null);
  const [historyRange, setHistoryRange] = useState<'7d' | '30d'>('7d');
  const [overviewDate, setOverviewDate] = useState<'today' | 'yesterday'>('today');
  const [activeTab, setActiveTab] = useState<'overview' | 'activities' | 'history'>('overview');
  const [selectedActivityForMap, setSelectedActivityForMap] = useState<ActivityLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  console.log('[Fitbit] Rendering AppContent, state:', { 
    auth: isAuthenticated, 
    loading, 
    hasProfile: !!profile, 
    hasActivity: !!activity,
    activeTab 
  });
  const [debugData, setDebugData] = useState<any>(null);

  const heartRateZones = heartRate?.['activities-heart']?.[0]?.value?.heartRateZones || [];
  
  const heartChartData = useMemo(() => {
    try {
      if (heartRateZones.length > 0) {
        return heartRateZones.map((zone: any) => ({
          name: zone.name,
          minutes: zone.minutes,
          calories: zone.caloriesOut
        }));
      }
    } catch (e) {
      console.error('[Fitbit] Error processing heartChartData:', e);
    }
    return [];
  }, [heartRateZones]);

  const stepsHistory = useMemo(() => {
    // Try different possible keys for steps history
    const rawSteps = historyData?.['activities-steps'] || historyData?.['activities-log-steps'] || [];
    if (!Array.isArray(rawSteps) || rawSteps.length === 0) return [];
    
    return rawSteps.map((item: any) => {
      if (!item || !item.dateTime) return { date: '?', steps: 0 };
      try {
        // Fitbit date is YYYY-MM-DD
        const parts = item.dateTime.split('-');
        if (parts.length !== 3) return { date: item.dateTime, steps: parseInt(item.value) || 0 };
        
        const [y, m, d] = parts;
        const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        return {
          date: isNaN(date.getTime()) 
            ? item.dateTime 
            : date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
          steps: parseInt(item.value) || 0
        };
      } catch (e) {
        return { date: item.dateTime || '?', steps: parseInt(item.value) || 0 };
      }
    });
  }, [historyData]);

  const authHeaders = useMemo(() => {
    try {
      const savedTokens = localStorage.getItem('fitbit_tokens');
      if (savedTokens) {
        // Use a safer way to base64 encode or just handle potential errors
        return { 'Authorization': `Bearer ${btoa(unescape(encodeURIComponent(savedTokens)))}` };
      }
    } catch (e) {
      console.error('[Fitbit] Error encoding auth headers:', e);
    }
    return {};
  }, [isAuthenticated]);

  useEffect(() => {
    checkAuthStatus();
    
    const handleMessage = (event: MessageEvent) => {
      if (!event.origin.includes('run.app') && !event.origin.includes('localhost')) return;

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        if (event.data.tokens) {
          localStorage.setItem('fitbit_tokens', JSON.stringify(event.data.tokens));
        }
        setIsAuthenticated(true);
        fetchData();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, historyRange, overviewDate]);

  const checkAuthStatus = async () => {
    const savedTokens = localStorage.getItem('fitbit_tokens');
    if (savedTokens) {
      setIsAuthenticated(true);
      fetchData();
      return;
    }

    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setIsAuthenticated(data.authenticated);
      if (!data.authenticated) setLoading(false);
    } catch (err) {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    const savedTokens = localStorage.getItem('fitbit_tokens');
    const headers: any = {};
    if (savedTokens) {
      try {
        headers['Authorization'] = `Bearer ${btoa(unescape(encodeURIComponent(savedTokens)))}`;
      } catch (e) {
        console.error('[Fitbit] Error encoding headers in fetchData:', e);
      }
    }

    // Always return YYYY-MM-DD because some Fitbit endpoints are picky about 'today'
    const getFitbitDate = (d: 'today' | 'yesterday') => {
      const date = new Date();
      if (d === 'yesterday') {
        date.setDate(date.getDate() - 1);
      }
      // Use local time components to avoid UTC offset issues
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const targetDate = getFitbitDate(overviewDate);
    const todayDate = getFitbitDate('today');

    try {
      console.log(`[Fitbit] Fetching data for date: ${targetDate} (from ${overviewDate}), range: ${historyRange}`);
      
      const [profileRes, activityRes, heartRes, listRes, historyRes] = await Promise.all([
        fetch('/api/fitbit/profile', { headers }),
        fetch(`/api/fitbit/activities/date/${targetDate}`, { headers }),
        fetch(`/api/fitbit/activities/heart/date/${targetDate}/1d`, { headers }),
        fetch(`/api/fitbit/activities/list?beforeDate=${todayDate}&sort=desc&limit=20&offset=0`, { headers }),
        fetch(`/api/fitbit/activities/steps/date/${todayDate}/${historyRange}`, { headers })
      ]);

      // Check for refreshed tokens in any response
      const responses = [profileRes, activityRes, heartRes, listRes, historyRes];
      const refreshHeader = responses.find(r => r.headers.get('X-Fitbit-New-Tokens'))?.headers.get('X-Fitbit-New-Tokens');
      if (refreshHeader) {
        try {
          const newTokens = JSON.parse(atob(refreshHeader));
          console.log('[Fitbit] Received refreshed tokens from server');
          localStorage.setItem('fitbit_tokens', JSON.stringify(newTokens));
        } catch (e) {
          console.error('[Fitbit] Error parsing refreshed tokens:', e);
        }
      }

      // If any request returns 401, force logout
      if (responses.some(r => r.status === 401)) {
        console.warn('[Fitbit] Unauthorized detected in one or more requests - clearing tokens');
        localStorage.removeItem('fitbit_tokens');
        setIsAuthenticated(false);
        return;
      }

      const [profileData, activityData, heartData, listData, historyData] = await Promise.all([
        profileRes.json().catch(err => ({ _debug_error: err.message, errors: [{ message: 'Error al leer perfil' }] })),
        activityRes.json().catch(err => ({ _debug_error: err.message, errors: [{ message: 'Error al leer resumen de actividad' }] })),
        heartRes.json().catch(err => ({ _debug_error: err.message, errors: [{ message: 'Error al leer ritmo cardíaco' }] })),
        listRes.json().catch(err => ({ _debug_error: err.message, errors: [{ message: 'Error al leer lista de actividades' }] })),
        historyRes.json().catch(err => ({ _debug_error: err.message, errors: [{ message: 'Error al leer historial' }] }))
      ]);

      // Detect if server returned a refresh token failure
      const allResponsesData = [profileData, activityData, heartData, listData, historyData];
      if (allResponsesData.some(d => d.error === 'refresh_token_failed')) {
        console.warn('[Fitbit] Refresh token failed on server - forcing logout');
        localStorage.removeItem('fitbit_tokens');
        setIsAuthenticated(false);
        return;
      }

      setDebugData({
        profile: profileData,
        activity: activityData,
        heart: heartData,
        list: listData,
        history: historyData,
        _meta: {
          targetDate,
          todayDate,
          historyRange,
          timestamp: new Date().toISOString()
        }
      });

      console.log('[Fitbit] Raw Profile:', profileData);
      console.log('[Fitbit] Raw Activity Summary:', activityData);
      console.log('[Fitbit] Raw Heart Rate:', heartData);
      console.log('[Fitbit] Raw Activity List:', listData);
      console.log('[Fitbit] Raw History:', historyData);

      // Check for Fitbit-specific errors in the JSON body
      const allData = [
        { name: 'Perfil', data: profileData },
        { name: 'Resumen de Actividad', data: activityData },
        { name: 'Ritmo Cardíaco', data: heartData },
        { name: 'Lista de Actividades', data: listData },
        { name: 'Historial', data: historyData }
      ];

      const errorResponse = allData.find(d => d.data && d.data.errors);
      if (errorResponse) {
        const firstError = errorResponse.data.errors[0];
        console.error(`[Fitbit] API Error in ${errorResponse.name}:`, firstError);
        setError(`Error de Fitbit (${errorResponse.name}): ${firstError.message}`);
      }

      setProfile(profileData);
      setActivity(activityData);
      setHeartRate(heartData);
      setActivitiesList(listData?.activities || []);
      setHistoryData(historyData);
    } catch (err: any) {
      setError('Error al conectar con el servidor. Por favor, intenta de nuevo.');
      console.error('[Fitbit] Fetch Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      const res = await fetch('/api/auth/url');
      const { url } = await res.json();
      window.open(url, 'fitbit_oauth', 'width=600,height=700');
    } catch (err) {
      alert('Error al iniciar la conexión con Fitbit');
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('fitbit_tokens');
    await fetch('/api/auth/logout', { method: 'POST' });
    setIsAuthenticated(false);
    setProfile(null);
    setActivity(null);
    setHeartRate(null);
    setActivitiesList([]);
    setHistoryData(null);
  };

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center"
        >
          <div className="mb-8 inline-flex p-4 bg-emerald-500/10 rounded-3xl">
            <Activity className="w-16 h-16 text-emerald-500" />
          </div>
          <h1 className="text-5xl font-bold mb-4 tracking-tight">Fitbit Pro</h1>
          <p className="text-zinc-400 text-lg mb-10">
            Conecta tu cuenta de Fitbit para visualizar tu rendimiento físico, sueño y salud con análisis profesionales.
          </p>
          <button 
            onClick={handleConnect}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-4 px-8 rounded-2xl transition-all flex items-center justify-center gap-3 text-lg group"
          >
            Conectar con Fitbit
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
          
          <div className="mt-12 p-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl text-left">
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">Configuración Requerida</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Para usar esta aplicación, debes configurar tus credenciales de Fitbit en el panel de Secretos de AI Studio:
              <br/><br/>
              1. <strong>FITBIT_CLIENT_ID</strong>
              <br/>
              2. <strong>FITBIT_CLIENT_SECRET</strong>
              <br/><br/>
              Callback URL: <code className="bg-black p-1 rounded text-emerald-400">{window.location.origin}/auth/callback</code>
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  console.log('[Fitbit] Heart Rate Zones:', heartRateZones);

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-emerald-500/30">
      {/* Sidebar / Nav */}
      <nav className="fixed top-0 left-0 right-0 h-20 bg-black/50 backdrop-blur-xl border-b border-zinc-800 z-50 px-6 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500 rounded-lg">
              <Activity className="w-6 h-6 text-black" />
            </div>
            <span className="text-xl font-bold tracking-tight">Fitbit Pro</span>
          </div>
          
          <div className="hidden lg:flex items-center gap-1 bg-zinc-900/50 p-1 rounded-xl border border-zinc-800">
            <button 
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'overview' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Resumen
            </button>
            <button 
              onClick={() => setActiveTab('activities')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'activities' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Actividades
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'history' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Historial
            </button>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button 
            onClick={() => setShowDebug(!showDebug)}
            className={`p-2 rounded-full transition-colors ${showDebug ? 'bg-emerald-500 text-black' : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'}`}
            title="Debug Info"
          >
            <Activity className="w-5 h-5" />
          </button>
          <button 
            onClick={fetchData}
            className={`p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white ${loading ? 'animate-spin' : ''}`}
            title="Actualizar datos"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <div className="hidden md:flex items-center gap-4 px-4 py-2 bg-zinc-900 rounded-full border border-zinc-800">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-zinc-700 bg-zinc-800">
              {profile?.user?.avatar ? (
                <img src={profile.user.avatar} alt="Avatar" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="w-4 h-4 text-zinc-500" />
                </div>
              )}
            </div>
            <span className="text-sm font-medium text-zinc-300">{profile?.user?.displayName || 'Cargando...'}</span>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white"
            title="Cerrar Sesión"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </nav>

      <main className="pt-28 pb-12 px-6 max-w-7xl mx-auto">
        {showDebug && (
          <div className="mb-12 p-8 bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold flex items-center gap-3 text-emerald-400">
                <Activity className="w-6 h-6" />
                Panel de Depuración (Datos Crudos)
              </h3>
              <button 
                onClick={() => setShowDebug(false)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                Cerrar
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {debugData && Object.entries(debugData).map(([key, val]: [string, any]) => (
                <div key={key} className="bg-black/40 p-5 rounded-2xl border border-zinc-800/50">
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500 mb-3 flex items-center justify-between">
                    {key}
                    {val?.errors && <span className="text-rose-500 text-[10px]">CON ERRORES</span>}
                  </h4>
                  <pre className="text-[10px] text-zinc-400 font-mono overflow-auto max-h-60 custom-scrollbar">
                    {JSON.stringify(val, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div 
              key="overview"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                <div>
                  <h2 className="text-4xl font-bold tracking-tight mb-2">
                    Hola, {profile?.user?.fullName?.split(' ')[0] || profile?.user?.displayName || 'Atleta'}
                  </h2>
                  <div className="flex items-center gap-4">
                    <p className="text-zinc-400 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      {overviewDate === 'today' 
                        ? new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                        : new Date(Date.now() - 86400000).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                      }
                    </p>
                    <span className="text-zinc-700">|</span>
                    <p className="text-zinc-500 text-sm">Mostrando datos de <span className="text-emerald-500 font-semibold">{overviewDate === 'today' ? 'hoy' : 'ayer'}</span></p>
                  </div>
                </div>
                
                <div className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-xl border border-zinc-800 self-start">
                  <button 
                    onClick={() => setOverviewDate('today')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${overviewDate === 'today' ? 'bg-emerald-500 text-black' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    Hoy
                  </button>
                  <button 
                    onClick={() => setOverviewDate('yesterday')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${overviewDate === 'yesterday' ? 'bg-emerald-500 text-black' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    Ayer
                  </button>
                </div>
              </div>

              {/* Debug Panel */}
              {showDebug && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-12 bg-zinc-900 border border-zinc-800 rounded-3xl p-8 overflow-hidden"
                >
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Activity className="w-5 h-5 text-emerald-500" />
                      Diagnóstico de Datos Fitbit
                    </h3>
                    <button onClick={() => setShowDebug(false)} className="text-zinc-500 hover:text-white">
                      Cerrar
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 bg-black/30 rounded-2xl border border-zinc-800">
                      <p className="text-zinc-500 text-xs font-bold uppercase mb-1">Fecha Objetivo</p>
                      <p className="text-white font-mono">{debugData?._meta?.targetDate || '--'}</p>
                    </div>
                    <div className="p-4 bg-black/30 rounded-2xl border border-zinc-800">
                      <p className="text-zinc-500 text-xs font-bold uppercase mb-1">Hoy (Local)</p>
                      <p className="text-white font-mono">{debugData?._meta?.todayDate || '--'}</p>
                    </div>
                    <div className="p-4 bg-black/30 rounded-2xl border border-zinc-800">
                      <p className="text-zinc-500 text-xs font-bold uppercase mb-1">Rango Historial</p>
                      <p className="text-white font-mono">{debugData?._meta?.historyRange || '--'}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {['profile', 'activity', 'heart', 'list', 'history'].map((key) => (
                      <details key={key} className="group">
                        <summary className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-2xl cursor-pointer hover:bg-zinc-800 transition-all">
                          <span className="font-bold uppercase text-xs tracking-widest text-zinc-400 group-open:text-emerald-500">
                            RAW: {key.toUpperCase()}
                          </span>
                          <ChevronRight className="w-4 h-4 text-zinc-500 group-open:rotate-90 transition-transform" />
                        </summary>
                        <div className="mt-2 p-4 bg-black rounded-2xl border border-zinc-800 overflow-x-auto">
                          <pre className="text-[10px] font-mono text-emerald-400/80">
                            {JSON.stringify(debugData?.[key], null, 2)}
                          </pre>
                        </div>
                      </details>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                <StatCard 
                  title="Pasos"
                  value={activity?.summary?.steps?.toLocaleString() || '0'}
                  unit={`/ ${activity?.goals?.steps?.toLocaleString() || '10,000'}`}
                  icon={Zap}
                  color="bg-emerald-500"
                  trend={12}
                />
                <StatCard 
                  title="Calorías"
                  value={activity?.summary?.caloriesOut?.toLocaleString() || '0'}
                  unit="kcal"
                  icon={Activity}
                  color="bg-orange-500"
                  trend={5}
                />
                <StatCard 
                  title="Frecuencia Reposo"
                  value={heartRate?.['activities-heart']?.[0]?.value?.restingHeartRate || heartRate?.['activities-heart-intraday']?.dataset?.[0]?.value || '--'}
                  unit="bpm"
                  icon={Heart}
                  color="bg-rose-500"
                />
                <StatCard 
                  title="Minutos Activos"
                  value={(() => {
                    const summary = activity?.summary || {};
                    const oldMinutes = (summary.veryActiveMinutes || 0) + (summary.fairlyActiveMinutes || 0);
                    const activeZoneMinutes = summary.activeZoneMinutes?.totalMinutes || 0;
                    const trackerMinutes = summary.activeMinutes || 0;
                    return Math.max(oldMinutes, activeZoneMinutes, trackerMinutes);
                  })()}
                  unit="min"
                  icon={Clock}
                  color="bg-blue-500"
                />
              </div>

              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
                <ChartContainer title="Zonas de Ritmo Cardíaco" icon={Heart}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={heartChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis dataKey="name" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px' }}
                        itemStyle={{ color: '#10b981' }}
                      />
                      <Bar dataKey="minutes" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>

        <ChartContainer title="Niveles de Actividad" icon={Activity}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={[
              { name: 'Sedentario', value: activity?.summary?.sedentaryMinutes || 0 },
              { name: 'Ligero', value: activity?.summary?.lightlyActiveMinutes || 0 },
              { name: 'Moderado', value: activity?.summary?.fairlyActiveMinutes || 0 },
              { name: 'Intenso', value: activity?.summary?.veryActiveMinutes || 0 },
            ].filter(d => d.value > 0 || d.name === 'Sedentario')}>
                      <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis dataKey="name" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px' }}
                      />
                      <Area type="monotone" dataKey="value" stroke="#f59e0b" fillOpacity={1} fill="url(#colorValue)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            </motion.div>
          )}

          {activeTab === 'activities' && (
            <motion.div 
              key="activities"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold tracking-tight">Registro de Actividades</h2>
                <div className="flex items-center gap-2 text-zinc-500 text-sm">
                  <List className="w-4 h-4" />
                  Últimas 20 actividades
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {Array.isArray(activitiesList) && activitiesList.length > 0 ? (
                  activitiesList.map((act) => (
                    <div key={act.logId || Math.random()} className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl hover:border-emerald-500/30 transition-all group">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                          <div className="p-4 bg-emerald-500/10 rounded-2xl">
                            <Activity className="w-8 h-8 text-emerald-500" />
                          </div>
                          <div>
                            <h4 className="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors">
                              {act.activityName}
                            </h4>
                            <p className="text-zinc-500 flex items-center gap-2 text-sm">
                              <Calendar className="w-3 h-3" />
                              {new Date(act.startDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                              <span className="text-zinc-700">•</span>
                              <Clock className="w-3 h-3" />
                              {act.startTime}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                          <div>
                            <p className="text-zinc-500 text-xs uppercase font-bold tracking-widest mb-1">Duración</p>
                            <p className="text-lg font-semibold">{(act.duration / 60000).toFixed(0)} min</p>
                          </div>
                          <div>
                            <p className="text-zinc-500 text-xs uppercase font-bold tracking-widest mb-1">Calorías</p>
                            <p className="text-lg font-semibold">{act.calories} kcal</p>
                          </div>
                          <div>
                            <p className="text-zinc-500 text-xs uppercase font-bold tracking-widest mb-1">Distancia</p>
                            <p className="text-lg font-semibold">{act.distance?.toFixed(2) || '--'} km</p>
                          </div>
                          <div>
                            <p className="text-zinc-500 text-xs uppercase font-bold tracking-widest mb-1">Pasos</p>
                            <p className="text-lg font-semibold">{act.steps || '--'}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {act.tcxLink && (
                            <button 
                              onClick={() => setSelectedActivityForMap(act)}
                              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-all rounded-lg text-xs font-bold uppercase tracking-wider"
                            >
                              <MapPin className="w-3 h-3" />
                              Ver Mapa
                            </button>
                          )}
                          <button className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors">
                            <ChevronRight className="w-5 h-5 text-zinc-400" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-20 bg-zinc-900/30 border border-dashed border-zinc-800 rounded-3xl">
                    <Activity className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                    <p className="text-zinc-500">No se encontraron actividades registradas recientemente.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold tracking-tight">Historial de Rendimiento</h2>
                <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
                  <button 
                    onClick={() => setHistoryRange('7d')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${historyRange === '7d' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    7 DÍAS
                  </button>
                  <button 
                    onClick={() => setHistoryRange('30d')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${historyRange === '30d' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    30 DÍAS
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-8">
                <ChartContainer 
                  title={`Tendencia de Pasos (${historyRange === '7d' ? 'Última Semana' : 'Último Mes'})`} 
                  icon={BarChart3}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stepsHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis dataKey="date" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px' }}
                        itemStyle={{ color: '#10b981' }}
                      />
                      <Bar dataKey="steps" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
                    <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-2">Promedio Diario</p>
                    <h4 className="text-3xl font-bold text-white">
                      {(stepsHistory.reduce((acc, curr) => acc + curr.steps, 0) / (stepsHistory.length || 1)).toFixed(0).toLocaleString()}
                    </h4>
                    <p className="text-zinc-500 text-sm mt-1">pasos / día</p>
                  </div>
                  <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
                    <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-2">Total Periodo</p>
                    <h4 className="text-3xl font-bold text-emerald-500">
                      {stepsHistory.reduce((acc, curr) => acc + curr.steps, 0).toLocaleString()}
                    </h4>
                    <p className="text-zinc-500 text-sm mt-1">pasos totales</p>
                  </div>
                  <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
                    <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-2">Mejor Día</p>
                    <h4 className="text-3xl font-bold text-white">
                      {Math.max(...stepsHistory.map(d => d.steps), 0).toLocaleString()}
                    </h4>
                    <p className="text-zinc-500 text-sm mt-1">pasos récord</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="mt-12 py-8 border-t border-zinc-800 text-center text-zinc-500 text-sm">
        <p>© 2024 Fitbit Pro Dashboard. Desarrollado con ❤️ para atletas.</p>
      </footer>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-rose-500 text-white px-6 py-3 rounded-full shadow-2xl z-[100] flex items-center gap-3"
          >
            <span>{error}</span>
            <button onClick={() => setError(null)} className="hover:bg-white/20 rounded-full p-1">
              <ChevronRight className="w-4 h-4 rotate-90" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map Modal */}
      {selectedActivityForMap && (
        <MapModal 
          activity={selectedActivityForMap} 
          onClose={() => setSelectedActivityForMap(null)} 
          headers={authHeaders}
        />
      )}
    </div>
  );
}
