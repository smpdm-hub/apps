import React, { useState, useEffect, useReducer, createContext, useContext, useRef, Component } from 'react';
import { 
  UploadCloud, Folder, File, Users, LogOut, CheckCircle, 
  XCircle, Loader2, Search, Trash2, Plus, AlertTriangle,
  FileText, ImageIcon, HardDrive, FileArchive, BookOpen, ClipboardCheck, Settings, Link as LinkIcon, Edit, Key, ArrowLeft
} from 'lucide-react';

// ==========================================
// 1. KONFIGURASI & UTILITAS DATA
// ==========================================
// Mengambil URL Google Apps Script dari Environment Variables (.env)
// Jika tidak ditemukan, akan fallback ke URL default (untuk development)
const GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL || "https://script.google.com/macros/s/AKfycbzw3M_iibRuWfrvttDsna_HykEQ80xvbxmwv-talHOUrhqZry4aJUNumT2Wr-xZtE-f/exec";
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const getFileIcon = (mimeType, fileName = '') => {
  const typeStr = (mimeType || fileName || '').toLowerCase();
  if (typeStr.includes('image') || typeStr.match(/\.(jpg|jpeg|png|gif|svg)$/)) return <ImageIcon className="w-8 h-8 text-blue-500" />;
  if (typeStr.includes('pdf') || typeStr.match(/\.pdf$/)) return <FileText className="w-8 h-8 text-red-500" />;
  if (typeStr.includes('zip') || typeStr.includes('rar') || typeStr.match(/\.(zip|rar|7z)$/)) return <FileArchive className="w-8 h-8 text-amber-500" />;
  return <File className="w-8 h-8 text-slate-500" />;
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result.split(',')[1]);
  reader.onerror = error => reject(error);
});

// ==========================================
// 2. FUNGSI FETCH ANTI-CORS (STABIL)
// ==========================================
const getFromGas = async (action) => {
  try {
    const url = `${GAS_URL}?action=${action}&t=${Date.now()}`;
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const text = await res.text();
    try { 
      return JSON.parse(text); 
    } catch (err) { 
      throw new Error(`Respon GAS tidak valid: ${text.substring(0, 30)}...`); 
    }
  } catch (error) { 
    throw new Error("Gagal mengambil data dari server. Periksa koneksi atau URL GAS."); 
  }
};

const postToGas = async (payload) => {
  try {
    const res = await fetch(GAS_URL, { 
      method: 'POST', 
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload) 
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const text = await res.text();
    try { 
      return JSON.parse(text); 
    } catch (err) { 
      throw new Error("Format respons bukan JSON valid."); 
    }
  } catch (error) { 
    throw new Error("Gagal mengirim data. Periksa koneksi."); 
  }
};

// ==========================================
// 3. STATE MANAGEMENT (CONTEXT API)
// ==========================================
const AppContext = createContext();

const initialState = {
  user: JSON.parse(localStorage.getItem('app_user')) || null,
  config: { tahun: [], semester: [], ujian: [], mapel: [], kelas: [] }, 
  activities: [],
  files: [],
  bankSoalActivities: [], 
  bankSoalFiles: [],
  examLinks: [],
  usersList: [],
  uploadQueue: [],
  toast: null,
  isLoadingData: false,
};

function appReducer(state, action) {
  switch (action.type) {
    case 'LOGIN':
      localStorage.setItem('app_user', JSON.stringify(action.payload));
      return { ...state, user: action.payload };
    case 'LOGOUT':
      localStorage.removeItem('app_user');
      return { ...initialState, user: null };
    case 'SET_CONFIG':
      return { ...state, config: action.payload || initialState.config };
    case 'SET_DATA':
      return { ...state, activities: action.payload.activities || [], files: action.payload.files || [], isLoadingData: false };
    case 'SET_BANK_SOAL':
      return { 
        ...state, 
        bankSoalActivities: action.payload.activities || [], 
        bankSoalFiles: action.payload.files || [], 
        examLinks: action.payload.examLinks || [],
        isLoadingData: false 
      };
    case 'SET_USERS':
      return { ...state, usersList: action.payload || [] };
    case 'SET_LOADING_DATA':
      return { ...state, isLoadingData: action.payload };
    case 'ADD_TO_QUEUE':
      return { ...state, uploadQueue: [...state.uploadQueue, ...action.payload] };
    case 'UPDATE_QUEUE_ITEM':
      return { ...state, uploadQueue: state.uploadQueue.map(item => item.id === action.payload.id ? { ...item, ...action.payload.updates } : item) };
    case 'REMOVE_FROM_QUEUE':
      return { ...state, uploadQueue: state.uploadQueue.filter(item => item.id !== action.payload) };
    case 'SHOW_TOAST':
      return { ...state, toast: action.payload };
    case 'HIDE_TOAST':
      return { ...state, toast: null };
    default:
      return state;
  }
}

// ==========================================
// 4. ERROR BOUNDARY & KOMPONEN GLOBAL
// ==========================================
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-md w-full text-center border border-red-100">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-800 mb-2">Terjadi Kesalahan Sistem</h2>
            <p className="text-slate-600 text-sm mb-4">Aplikasi mengalami kendala. Cobalah muat ulang halaman.</p>
            <button onClick={() => window.location.reload()} className="bg-slate-800 text-white px-4 py-2 rounded-lg">Muat Ulang</button>
          </div>
        </div>
      );
    }
    return this.props.children; 
  }
}

const Toast = () => {
  const { state, dispatch } = useContext(AppContext);
  useEffect(() => {
    if (state.toast) {
      const timer = setTimeout(() => dispatch({ type: 'HIDE_TOAST' }), 4000);
      return () => clearTimeout(timer);
    }
  }, [state.toast, dispatch]);

  if (!state.toast) return null;
  const isError = state.toast.type === 'error';
  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-slide-in w-[90%] max-w-md">
      <div className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border ${isError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
        {isError ? <XCircle className="w-5 h-5 mt-0.5 shrink-0" /> : <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" />}
        <span className="font-medium text-sm break-words">{state.toast.message}</span>
      </div>
    </div>
  );
};

const Spinner = ({ className = "w-5 h-5" }) => <Loader2 className={`animate-spin ${className}`} />;

// ==========================================
// 5. LOGIN VIEW
// ==========================================
const LoginView = () => {
  const { dispatch } = useContext(AppContext);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ username: '', password: '' });

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await postToGas({ action: 'login', ...formData });
      if (data.status === 'success') {
        dispatch({ type: 'LOGIN', payload: data.user });
        dispatch({ type: 'SHOW_TOAST', payload: { message: "Selamat Datang!", type: "success" } });
      } else throw new Error(data.message || 'Username atau password salah');
    } catch (error) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: error.message, type: "error" } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-100">
        <div className="flex justify-center mb-6"><div className="bg-blue-100 p-3 rounded-full"><HardDrive className="w-8 h-8 text-blue-600" /></div></div>
        <h1 className="text-2xl font-bold text-center text-slate-800 mb-2">Portal Terpadu Sekolah</h1>
        <p className="text-center text-slate-500 mb-8 text-sm">Masuk untuk mengakses sistem sekolah</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
            <input required type="text" className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input required type="password" className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
          </div>
          <button disabled={loading} type="submit" className="w-full bg-blue-600 text-white font-bold py-2 rounded-lg hover:bg-blue-700 flex justify-center items-center gap-2">
            {loading ? <Spinner /> : 'Masuk'}
          </button>
        </form>
      </div>
      <p className="mt-8 text-xs text-slate-400">© 2026 Sistem Terpadu Sekolah. All rights reserved.</p>
    </div>
  );
};

// ==========================================
// 6. UPLOAD DOKUMENTASI VIEW
// ==========================================
const UploadFotoView = () => {
  const { state, dispatch } = useContext(AppContext);
  const [dragActive, setDragActive] = useState(false);
  const [formData, setFormData] = useState({ title: '', date: '' });
  const fileInputRef = useRef(null);

  const processFiles = (files) => {
    if (!formData.title || !formData.date) return dispatch({ type: 'SHOW_TOAST', payload: { message: "Isi Judul dan Tanggal kegiatan terlebih dahulu!", type: "error" } });

    const newQueue = Array.from(files).map((file, index) => {
      if (file.size > MAX_FILE_SIZE) {
        dispatch({ type: 'SHOW_TOAST', payload: { message: `File ${file.name} melebihi batas 20MB!`, type: "error" } });
        return null;
      }
      const newName = `${formData.title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}_${index}.${file.name.split('.').pop()}`;
      return { 
        id: Math.random().toString(36).substring(2, 11), 
        originalFile: file, 
        name: newName, 
        title: formData.title, 
        date: formData.date, 
        size: formatBytes(file.size), 
        status: 'pending', 
        progress: 0, 
        isBankSoal: false 
      };
    }).filter(Boolean);

    if (newQueue.length > 0) dispatch({ type: 'ADD_TO_QUEUE', payload: newQueue });
  };

  const handleStartUpload = async () => {
    const pendingItems = state.uploadQueue.filter(i => !i.isBankSoal && i.status === 'pending');
    if (pendingItems.length === 0) return;

    for (const item of pendingItems) {
      dispatch({ type: 'UPDATE_QUEUE_ITEM', payload: { id: item.id, updates: { status: 'uploading', progress: 10 } } });
      
      const interval = setInterval(() => {
         dispatch({ type: 'UPDATE_QUEUE_ITEM', payload: { id: item.id, updates: { 
           progress: Math.min(90, Math.floor(Math.random() * 10) + 10) 
         }} });
      }, 500);

      try {
        const base64Data = await fileToBase64(item.originalFile);
        const data = await postToGas({ 
          action: 'upload', 
          activityTitle: item.title, 
          activityDate: item.date, 
          fileName: item.name, 
          mimeType: item.originalFile.type, 
          fileData: base64Data 
        });
        
        clearInterval(interval);
        if (data.status === 'success') {
          dispatch({ type: 'UPDATE_QUEUE_ITEM', payload: { id: item.id, updates: { status: 'success', progress: 100 } } });
          dispatch({ type: 'SHOW_TOAST', payload: { message: `Berhasil mengunggah ${item.name}`, type: "success" } });
        } else {
          throw new Error(data.message || "Gagal mengunggah file");
        }
      } catch (error) {
        clearInterval(interval);
        dispatch({ type: 'UPDATE_QUEUE_ITEM', payload: { id: item.id, updates: { status: 'error', progress: 0 } } });
        dispatch({ type: 'SHOW_TOAST', payload: { message: `Gagal: ${error.message}`, type: "error" } });
      }
    }
  };

  const pendingFiles = state.uploadQueue.filter(i => !i.isBankSoal && i.status === 'pending');
  const isUploading = state.uploadQueue.some(i => !i.isBankSoal && i.status === 'uploading');

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-slide-in">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2"><UploadCloud className="w-6 h-6 text-blue-600" /> Unggah Foto Kegiatan</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Judul Kegiatan</label>
            <input type="text" placeholder="Cth: Lomba 17 Agustus" className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tanggal Kegiatan</label>
            <input type="date" className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
          </div>
        </div>
        <div className={`border-2 border-dashed rounded-2xl p-10 text-center transition ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:bg-slate-50'}`}
          onDragEnter={() => setDragActive(true)} onDragLeave={() => setDragActive(false)} onDragOver={e => e.preventDefault()} 
          onDrop={e => { e.preventDefault(); setDragActive(false); processFiles(e.dataTransfer.files); }}>
          <UploadCloud className="w-12 h-12 mx-auto mb-3 text-slate-400" />
          <p className="text-slate-600 font-medium mb-4">Tarik & Lepas gambar ke area ini</p>
          <input type="file" accept="image/*,application/pdf" multiple className="hidden" ref={fileInputRef} onChange={e => processFiles(e.target.files)} />
          <button onClick={() => fileInputRef.current.click()} className="bg-white border border-slate-300 text-slate-700 font-semibold px-6 py-2.5 rounded-lg text-sm shadow-sm hover:bg-slate-50">Pilih Berkas</button>
        </div>
      </div>

      {state.uploadQueue.filter(i => !i.isBankSoal).length > 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Antrean Unggah Foto</h3>
          <div className="space-y-3 mb-4 max-h-[40vh] overflow-y-auto pr-2">
            {state.uploadQueue.filter(i => !i.isBankSoal).map(item => (
              <div key={item.id} className="flex justify-between items-center p-3 rounded-xl border bg-slate-50 hover:bg-slate-100 transition">
                <div className="flex gap-3 overflow-hidden items-center w-full">
                  {getFileIcon(item.originalFile.type, item.name)}
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm font-semibold truncate text-slate-800" title={item.name}>{item.name}</p>
                    <p className="text-xs text-slate-500">{item.size}</p>
                    {(item.status === 'uploading' || item.status === 'success') && (
                      <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
                        <div className={`h-1.5 rounded-full transition-all duration-300 ${item.status === 'success' ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{width: `${item.progress || 0}%`}}></div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="shrink-0 ml-2 flex items-center">
                  {item.status === 'pending' && <button onClick={() => dispatch({type: 'REMOVE_FROM_QUEUE', payload: item.id})} className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded transition">Batal</button>}
                  {item.status === 'uploading' && <span className="text-xs font-bold text-blue-600">{item.progress}%</span>}
                  {item.status === 'success' && <CheckCircle className="w-6 h-6 text-emerald-500" />}
                  {item.status === 'error' && <XCircle className="w-6 h-6 text-red-500" title="Gagal unggah" />}
                </div>
              </div>
            ))}
          </div>
          
          {pendingFiles.length > 0 && (
             <button onClick={handleStartUpload} disabled={isUploading} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 flex justify-center items-center gap-2 shadow-md transition disabled:opacity-70 disabled:cursor-not-allowed">
               {isUploading ? <Spinner className="w-5 h-5 text-white" /> : <UploadCloud className="w-5 h-5" />}
               {isUploading ? 'Sedang Memproses...' : `Mulai Unggah ${pendingFiles.length} Berkas`}
             </button>
          )}
        </div>
      )}
    </div>
  );
};

// ==========================================
// 7. GALERI FOTO VIEW
// ==========================================
const GaleriFotoView = () => {
  const { state, dispatch } = useContext(AppContext);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchGallery = async () => {
      dispatch({ type: 'SET_LOADING_DATA', payload: true });
      try { 
        const data = await getFromGas('getData'); 
        dispatch({ type: 'SET_DATA', payload: data }); 
      }
      catch (error) {
        dispatch({ type: 'SHOW_TOAST', payload: { message: `Gagal memuat galeri: ${error.message}`, type: "error" } });
      } finally { 
        dispatch({ type: 'SET_LOADING_DATA', payload: false }); 
      }
    };
    fetchGallery();
  }, [dispatch]);

  const handleDelete = async (id, itemType) => {
    if (!confirm(`Yakin ingin menghapus ${itemType === 'folder' ? 'folder beserta isinya' : 'file'} ini permanen?`)) return;
    dispatch({ type: 'SET_LOADING_DATA', payload: true });
    try {
      const res = await postToGas({ action: 'deleteItem', id, itemType });
      if (res.status === 'success') {
        dispatch({ type: 'SHOW_TOAST', payload: { message: `${itemType} berhasil dihapus!`, type: "success" } });
        if (itemType === 'folder' && selectedFolder?.id === id) setSelectedFolder(null);
        // Refresh data
        const data = await getFromGas('getData');
        dispatch({ type: 'SET_DATA', payload: data });
      } else throw new Error(res.message);
    } catch (err) { 
      dispatch({ type: 'SHOW_TOAST', payload: { message: err.message, type: "error" } });
    } finally { 
      dispatch({ type: 'SET_LOADING_DATA', payload: false }); 
    }
  };

  const filteredActivities = state.activities.filter(a => {
    const title = a.title || "";
    return title.toLowerCase().includes(search.toLowerCase());
  });

  if (state.isLoadingData) return <div className="flex flex-col items-center justify-center py-20"><Spinner className="w-10 h-10 text-blue-500 mb-4"/><p className="text-slate-500 font-medium text-sm">Memuat data dari Google Drive...</p></div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-slide-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          {selectedFolder ? (
            <button onClick={() => setSelectedFolder(null)} className="flex items-center gap-2 text-blue-600 hover:text-blue-800 transition">
              <ArrowLeft className="w-5 h-5" /> Kembali
            </button>
          ) : (
            <><Folder className="w-6 h-6 text-blue-500"/> Galeri Dokumentasi</>
          )}
        </h2>
        
        {!selectedFolder && (
          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Cari folder kegiatan..." 
              className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      {selectedFolder && (
        <div className="bg-blue-50 text-blue-800 p-4 rounded-xl border border-blue-100 font-medium">
          Menampilkan isi folder: <span className="font-bold">{selectedFolder.title}</span> ({selectedFolder.date})
        </div>
      )}

      {!selectedFolder ? (
        filteredActivities.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
             <Folder className="w-12 h-12 text-slate-300 mx-auto mb-3" />
             <p className="text-slate-500 font-medium">Tidak ada folder kegiatan yang ditemukan.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredActivities.map(folder => {
              const fileCount = state.files.filter(f => f.activityId === folder.id).length;
              return (
                <div key={folder.id} onClick={() => setSelectedFolder(folder)} className="bg-white p-5 rounded-xl shadow-sm border cursor-pointer hover:border-blue-300 hover:shadow-md transition flex flex-col group relative">
                  <div className="flex items-start gap-4 mb-2">
                    <Folder className="w-10 h-10 text-blue-400 shrink-0" />
                    <div className="overflow-hidden flex-1">
                      <h3 className="font-bold text-slate-800 line-clamp-2 text-sm" title={folder.title}>{folder.title}</h3>
                    </div>
                  </div>
                  <div className="mt-auto pt-3 border-t border-slate-50 flex justify-between items-center">
                    <span className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-600 font-semibold">{fileCount} Berkas</span>
                    <span className="text-[10px] text-slate-400">{folder.date}</span>
                  </div>
                  
                  {state.user.role === 'admin' && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(folder.id, 'folder'); }} 
                      className="absolute top-3 right-3 p-1.5 text-red-400 hover:text-white hover:bg-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition shadow-sm bg-white"
                      title="Hapus Folder Permanen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {state.files.filter(f => f.activityId === selectedFolder.id).length === 0 && (
             <div className="col-span-full text-center py-12 text-slate-500">Folder ini kosong.</div>
          )}
          {state.files.filter(f => f.activityId === selectedFolder.id).map(file => (
            <div key={file.id} className="bg-white rounded-xl shadow-sm border overflow-hidden group flex flex-col">
              <div className="aspect-square bg-slate-100 flex items-center justify-center relative overflow-hidden">
                {/* Fallback jika gambar gagal dimuat, tampilkan ikon dokumen */}
                <img src={file.downloadUrl} alt={file.newName} className="w-full h-full object-cover transition duration-300 group-hover:scale-110" 
                     onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                <div className="absolute inset-0 items-center justify-center bg-slate-100 hidden">
                   {getFileIcon('application/octet-stream', file.newName)}
                </div>
              </div>
              <div className="p-3 flex flex-col flex-1">
                <p className="text-xs font-semibold truncate mb-1 text-slate-700" title={file.newName}>{file.newName}</p>
                <div className="flex gap-2 mt-auto pt-2">
                  <a href={file.url} target="_blank" rel="noreferrer" className="text-[10px] text-center flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 py-1.5 rounded font-bold transition">Buka</a>
                  {state.user.role === 'admin' && (
                    <button onClick={() => handleDelete(file.id, 'file')} className="text-[10px] text-center bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded font-bold transition">Hapus</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ==========================================
// 8. UPLOAD BANK SOAL VIEW
// ==========================================
const UploadSoalView = () => {
  const { state, dispatch } = useContext(AppContext);
  const { config } = state;
  const [form, setForm] = useState({ 
    tahun: config.tahun[0] || '', semester: config.semester[0] || '', 
    ujian: config.ujian[0] || '', mapel: '', kelas: '', link: ''
  });
  
  const [checklist, setChecklist] = useState({ kisi: false, naskah: false, kunci: false });
  const fileInputRef = useRef(null);
  
  useEffect(() => {
    getFromGas('getBankSoal')
      .then(data => dispatch({ type: 'SET_BANK_SOAL', payload: data }))
      .catch(()=>null);
  }, [dispatch]);

  const actTitle = `${form.tahun.replace(/\//g, '-')}_${form.semester}_${form.ujian}`;
  const actDate = form.mapel && form.kelas ? `${form.mapel.replace(/[^a-zA-Z0-9]/g, '_')}_${form.kelas}` : '';
  const idMapelKelas = `${actTitle}_${actDate}`;
  
  let hasExistingFile = false;
  let currentLink = '';
  
  if (actDate) {
    const existingFolder = state.bankSoalActivities.find(a => a.title === actTitle && a.date === actDate);
    if (existingFolder && state.bankSoalFiles.some(f => f.activityId === existingFolder.id)) {
      hasExistingFile = true;
    }
    const matchLink = state.examLinks.find(l => l.id === idMapelKelas);
    if (matchLink) currentLink = matchLink.url;
  }

  const isChecklistComplete = checklist.kisi && checklist.naskah && checklist.kunci;
  const isSetupComplete = form.mapel && form.kelas;

  const processFiles = (files) => {
    if (!isSetupComplete) return dispatch({ type: 'SHOW_TOAST', payload: { message: "Pilih Mapel & Kelas!", type: "error" } });
    if (!isChecklistComplete) return dispatch({ type: 'SHOW_TOAST', payload: { message: "Centang kelengkapan checklist!", type: "error" } });
    if (hasExistingFile) return dispatch({ type: 'SHOW_TOAST', payload: { message: "Naskah sudah ada. Hapus di Arsip jika ingin mengganti.", type: "error" } });

    const newQueue = Array.from(files).map((file, index) => {
      if (file.size > MAX_FILE_SIZE) {
        dispatch({ type: 'SHOW_TOAST', payload: { message: `File melebihi 20MB!`, type: "error" } });
        return null;
      }
      const newName = `${form.ujian}_${actDate}_${Date.now()}_${index}.${file.name.split('.').pop()}`;
      return { 
        id: Math.random().toString(36).substring(2, 9), 
        originalFile: file, 
        name: newName, 
        title: actTitle, 
        date: actDate, 
        size: formatBytes(file.size), 
        status: 'pending', 
        progress: 0, 
        isBankSoal: true 
      };
    }).filter(Boolean);

    if (newQueue.length > 0) dispatch({ type: 'ADD_TO_QUEUE', payload: newQueue });
  };

  const handleStartUpload = async () => {
    const pendingItems = state.uploadQueue.filter(i => i.isBankSoal && i.status === 'pending');
    if (pendingItems.length === 0) return;

    for (const item of pendingItems) {
      dispatch({ type: 'UPDATE_QUEUE_ITEM', payload: { id: item.id, updates: { status: 'uploading', progress: 10 } } });
      
      const interval = setInterval(() => {
         dispatch({ type: 'UPDATE_QUEUE_ITEM', payload: { id: item.id, updates: { progress: Math.min(90, Math.floor(Math.random() * 10) + 10) }} });
      }, 500);

      try {
        const base64Data = await fileToBase64(item.originalFile);
        const data = await postToGas({ action: 'uploadBankSoal', activityTitle: item.title, activityDate: item.date, fileName: item.name, mimeType: item.originalFile.type, fileData: base64Data });

        clearInterval(interval);

        if (data.status === 'success') {
          dispatch({ type: 'UPDATE_QUEUE_ITEM', payload: { id: item.id, updates: { status: 'success', progress: 100 } } });
          
          if (form.link) {
            await postToGas({ action: 'saveExamLink', idMapelKelas: idMapelKelas, linkUrl: form.link });
          }
          
          dispatch({ type: 'SHOW_TOAST', payload: { message: "Naskah berhasil diunggah!", type: "success" } });
          setForm({ ...form, link: '' });
          setChecklist({ kisi: false, naskah: false, kunci: false });
          
          // Refresh Bank Soal Data
          const refresh = await getFromGas('getBankSoal');
          dispatch({ type: 'SET_BANK_SOAL', payload: refresh });
        } else throw new Error(data.message || "Gagal");
      } catch (error) {
        clearInterval(interval);
        dispatch({ type: 'UPDATE_QUEUE_ITEM', payload: { id: item.id, updates: { status: 'error', progress: 0 } } });
        dispatch({ type: 'SHOW_TOAST', payload: { message: error.message, type: "error" } });
      }
    }
  };

  const handleOnlySaveLink = async () => {
    if (!form.link) return;
    dispatch({ type: 'SET_LOADING_DATA', payload: true });
    try {
      const data = await postToGas({ action: 'saveExamLink', idMapelKelas: idMapelKelas, linkUrl: form.link });
      if (data.status === 'success') {
         dispatch({ type: 'SHOW_TOAST', payload: { message: "Link ujian berhasil disimpan!", type: "success" } });
         setForm({...form, link: ''});
         const refresh = await getFromGas('getBankSoal');
         dispatch({ type: 'SET_BANK_SOAL', payload: refresh });
      } else throw new Error("Gagal menyimpan link");
    } catch (error) {
       dispatch({ type: 'SHOW_TOAST', payload: { message: error.message, type: "error" } });
    } finally {
       dispatch({ type: 'SET_LOADING_DATA', payload: false });
    }
  };

  const pendingFiles = state.uploadQueue.filter(i => i.isBankSoal && i.status === 'pending');
  const isUploading = state.uploadQueue.some(i => i.isBankSoal && i.status === 'uploading');

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-slide-in">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2"><BookOpen className="w-6 h-6 text-indigo-600" /> Unggah Naskah Ujian</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tahun Pelajaran</label>
            <select className="w-full px-3 py-2 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-indigo-500" value={form.tahun} onChange={e => setForm({...form, tahun: e.target.value})}>
              {config.tahun.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Semester</label>
            <select className="w-full px-3 py-2 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-indigo-500" value={form.semester} onChange={e => setForm({...form, semester: e.target.value})}>
              {config.semester.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Jenis Ujian</label>
            <select className="w-full px-3 py-2 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-indigo-500" value={form.ujian} onChange={e => setForm({...form, ujian: e.target.value})}>
              {config.ujian.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mata Pelajaran</label>
            <select className="w-full px-3 py-2 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-indigo-500" value={form.mapel} onChange={e => setForm({...form, mapel: e.target.value})}>
              <option value="">-- Pilih Mata Pelajaran --</option>
              {config.mapel.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Kelas</label>
            <select className="w-full px-3 py-2 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-indigo-500" value={form.kelas} onChange={e => setForm({...form, kelas: e.target.value})}>
              <option value="">-- Pilih Kelas --</option>
              {config.kelas.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>

        <div className="mb-6 border-b border-slate-100 pb-6">
           <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1"><LinkIcon className="w-4 h-4 text-purple-500"/> Link Ujian Online (Google Form / CBT) - Opsional</label>
           <div className="flex gap-2">
             <input type="url" placeholder={currentLink ? `Link tersimpan: ${currentLink}` : "https://forms.gle/..."} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100" 
                value={form.link} onChange={e => setForm({...form, link: e.target.value})} disabled={!isSetupComplete} />
             
             {hasExistingFile && (
               <button onClick={handleOnlySaveLink} disabled={!form.link} className="bg-purple-600 text-white px-5 py-2 rounded-lg font-bold hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap shadow-md transition">
                 Simpan Link
               </button>
             )}
           </div>
           {currentLink && <p className="text-xs text-emerald-600 font-semibold mt-1">✓ Link sudah terdaftar di server.</p>}
        </div>

        {hasExistingFile ? (
           <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl text-center">
             <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
             <h3 className="text-lg font-bold text-amber-900 mb-1">Berkas Naskah Soal Terdeteksi</h3>
             <p className="text-amber-800 text-sm mb-3">Naskah untuk Mata Pelajaran & Kelas ini <b>sudah diunggah sebelumnya</b>. Anda hanya diperbolehkan meng-update tautan link ujian online di atas.</p>
           </div>
        ) : !isSetupComplete ? (
           <div className="p-8 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-center text-slate-400 font-medium">
             Pilih Mata Pelajaran dan Kelas untuk memunculkan area unggah.
           </div>
        ) : (
           <>
             <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
               <label className="block text-sm font-bold text-slate-800 mb-3">Checklist Kelengkapan (Wajib Dicentang)</label>
               <div className="space-y-2">
                 {Object.keys(checklist).map((key) => (
                    <label key={key} className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${checklist[key] ? 'bg-indigo-100' : 'bg-white border border-slate-200 hover:bg-slate-50'}`}>
                      <input type="checkbox" className="w-5 h-5 text-indigo-600 rounded border-slate-300" checked={checklist[key]} onChange={(e) => setChecklist({...checklist, [key]: e.target.checked})} />
                      <span className={`text-sm font-semibold ${checklist[key] ? 'text-indigo-800' : 'text-slate-600'}`}>
                        {key === 'kisi' ? '1. Kisi-kisi Ujian Telah Selesai & Divalidasi' : key === 'naskah' ? '2. Naskah Soal Sesuai Kaidah & Bebas SARA' : '3. Kunci Jawaban Tersedia'}
                      </span>
                    </label>
                 ))}
               </div>
             </div>

             <div className={`border-2 border-dashed rounded-2xl p-10 text-center transition ${!isChecklistComplete ? 'border-slate-300 bg-slate-50 opacity-70 cursor-not-allowed' : 'border-indigo-500 bg-indigo-50/50 hover:bg-indigo-50'}`}
               onDragOver={e => e.preventDefault()} 
               onDrop={e => { e.preventDefault(); if(isChecklistComplete) processFiles(e.dataTransfer.files); }}>
               <UploadCloud className={`w-12 h-12 mx-auto mb-3 ${!isChecklistComplete ? 'text-slate-400' : 'text-indigo-500'}`} />
               <p className={`font-semibold mb-2 ${!isChecklistComplete ? 'text-slate-500' : 'text-indigo-700'}`}>
                 {!isChecklistComplete ? 'Selesaikan checklist terlebih dahulu' : 'Seret & Lepas naskah soal (PDF/Word) ke sini'}
               </p>
               <input type="file" multiple className="hidden" ref={fileInputRef} onChange={e => processFiles(e.target.files)} disabled={!isChecklistComplete} />
               <button onClick={() => fileInputRef.current.click()} disabled={!isChecklistComplete} className="bg-white border px-6 py-2.5 rounded-lg text-sm font-bold shadow-sm disabled:opacity-50 text-slate-700 mt-2 hover:bg-slate-50">Pilih Berkas Naskah</button>
             </div>
           </>
        )}
      </div>

      {state.uploadQueue.filter(i => i.isBankSoal).length > 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mt-6">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Antrean Unggah Naskah</h3>
          <div className="space-y-3 mb-4">
            {state.uploadQueue.filter(i => i.isBankSoal).map(item => (
              <div key={item.id} className="flex justify-between items-center p-3 rounded-xl border bg-slate-50">
                <div className="flex gap-3 overflow-hidden items-center w-full">
                  <FileText className="w-8 h-8 text-indigo-400 shrink-0" />
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm font-bold truncate text-slate-800" title={item.name}>{item.name}</p>
                    <p className="text-xs text-slate-500">{item.size}</p>
                    {(item.status === 'uploading' || item.status === 'success') && (
                      <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
                        <div className={`h-1.5 rounded-full transition-all duration-300 ${item.status === 'success' ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{width: `${item.progress || 0}%`}}></div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="shrink-0 ml-2">
                  {item.status === 'pending' && <button onClick={() => dispatch({type: 'REMOVE_FROM_QUEUE', payload: item.id})} className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded transition">Batal</button>}
                  {item.status === 'uploading' && <span className="text-xs font-bold text-indigo-600">{item.progress}%</span>}
                  {item.status === 'success' && <CheckCircle className="w-6 h-6 text-emerald-500" />}
                  {item.status === 'error' && <XCircle className="w-6 h-6 text-red-500" />}
                </div>
              </div>
            ))}
          </div>

          {pendingFiles.length > 0 && (
             <button onClick={handleStartUpload} disabled={isUploading} className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl hover:bg-indigo-700 flex justify-center items-center gap-2 shadow-md transition disabled:opacity-70">
               {isUploading ? <Spinner className="w-5 h-5 text-white" /> : <UploadCloud className="w-5 h-5" />}
               {isUploading ? 'Sedang Memproses...' : `Mulai Unggah ${pendingFiles.length} Berkas`}
             </button>
          )}
        </div>
      )}
    </div>
  );
};

// ==========================================
// 9. ARSIP & PANTAU SOAL VIEW
// ==========================================
const ArsipSoalView = () => {
  const { state, dispatch } = useContext(AppContext);
  useEffect(() => {
    const fetch = async () => {
      dispatch({ type: 'SET_LOADING_DATA', payload: true });
      try { const data = await getFromGas('getBankSoal'); dispatch({ type: 'SET_BANK_SOAL', payload: data }); }
      catch (error) {} finally { dispatch({ type: 'SET_LOADING_DATA', payload: false }); }
    };
    fetch();
  }, [dispatch]);

  const handleDelete = async (id, itemType) => {
    if (!confirm(`Yakin ingin menghapus ${itemType} bank soal ini?`)) return;
    dispatch({ type: 'SET_LOADING_DATA', payload: true });
    try {
      const res = await postToGas({ action: 'deleteItem', id, itemType });
      if (res.status === 'success') {
        dispatch({ type: 'SHOW_TOAST', payload: { message: `${itemType} berhasil dihapus!`, type: "success" } });
        const data = await getFromGas('getBankSoal');
        dispatch({ type: 'SET_BANK_SOAL', payload: data });
      } else throw new Error(res.message);
    } catch (err) { dispatch({ type: 'SHOW_TOAST', payload: { message: err.message, type: "error" } }); } 
    finally { dispatch({ type: 'SET_LOADING_DATA', payload: false }); }
  };

  if (state.isLoadingData) return <div className="text-center py-20"><Spinner className="w-10 h-10 mx-auto text-indigo-500 mb-4"/><p className="text-slate-500 font-medium text-sm">Memuat Arsip Soal...</p></div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-slide-in">
      <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><BookOpen className="w-6 h-6 text-indigo-500" /> Arsip Bank Soal</h2>
      
      {state.bankSoalFiles.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-300">
           <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
           <p className="text-slate-500 font-medium">Belum ada naskah soal yang diarsipkan.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-slate-50 border-b">
                <tr><th className="py-3 px-4 font-semibold text-slate-600">Nama Berkas Naskah</th><th className="py-3 px-4 font-semibold text-slate-600">Kategori / Folder</th><th className="py-3 px-4 text-right font-semibold text-slate-600">Aksi</th></tr>
              </thead>
              <tbody>
                {state.bankSoalFiles.map(file => {
                  const info = state.bankSoalActivities.find(a => a.id === file.activityId) || {};
                  const linkInfo = state.examLinks.find(l => l.id === `${info.title}_${info.date}`);
                  return (
                    <tr key={file.id} className="border-b hover:bg-slate-50 group">
                      <td className="py-4 px-4 font-medium flex items-center gap-3">
                        {getFileIcon(null, file.newName)}
                        <span className="truncate max-w-[200px] md:max-w-xs block" title={file.newName}>{file.newName}</span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">{info.title}</span>
                          <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded w-max mt-1">{info.date}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex justify-end gap-2 items-center">
                          {linkInfo && <a href={linkInfo.url} target="_blank" rel="noreferrer" title="Buka Link Ujian Online" className="text-purple-600 bg-purple-50 hover:bg-purple-100 p-2 rounded-lg transition border border-purple-100"><LinkIcon className="w-4 h-4"/></a>}
                          <a href={file.url} target="_blank" rel="noreferrer" className="text-blue-600 font-bold text-xs bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg transition border border-blue-100">Buka Berkas</a>
                          {state.user.role === 'admin' && (
                            <button onClick={() => handleDelete(file.id, 'file')} className="text-red-600 font-bold text-xs bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg transition border border-red-100">Hapus</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const PantauSoalView = () => {
  const { state } = useContext(AppContext);
  const { config } = state;
  const [filter, setFilter] = useState({ tahun: config.tahun[0]||'', semester: config.semester[0]||'', ujian: config.ujian[0]||'' });

  const checkStatus = (mapel, kelas) => {
    const pFolder = `${filter.tahun.replace(/\//g, '-')}_${filter.semester}_${filter.ujian}`;
    const pSub = `${mapel.replace(/[^a-zA-Z0-9]/g, '_')}_${kelas}`;
    
    const folder = state.bankSoalActivities.find(a => a.title === pFolder && a.date === pSub);
    const hasFile = folder ? state.bankSoalFiles.some(f => f.activityId === folder.id) : false;
    const hasLink = state.examLinks.some(l => l.id === `${pFolder}_${pSub}`);

    return { hasFile, hasLink };
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-slide-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-xl shadow-sm border border-slate-100">
        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800"><ClipboardCheck className="text-emerald-600 w-6 h-6" /> Pantau Naskah & Link</h2>
        <div className="flex flex-wrap gap-2">
          {['tahun', 'semester', 'ujian'].map(key => (
            <select key={key} className="px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500" value={filter[key]} onChange={e => setFilter({...filter, [key]: e.target.value})}>
              {config[key].map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          ))}
        </div>
      </div>
      
      <div className="flex flex-wrap gap-4 text-xs text-slate-600 bg-white p-4 rounded-xl border border-slate-100 shadow-sm font-medium">
         <div className="flex items-center gap-1.5"><FileText className="w-4 h-4 text-indigo-500"/> Status File Naskah</div>
         <div className="flex items-center gap-1.5"><LinkIcon className="w-4 h-4 text-purple-500"/> Status Link Online</div>
         <div className="flex items-center gap-1.5 ml-auto"><CheckCircle className="w-4 h-4 text-emerald-500"/> Siap</div>
         <div className="flex items-center gap-1.5"><XCircle className="w-4 h-4 text-red-300"/> Belum</div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-center border-collapse text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="py-4 px-4 text-left border-r font-bold text-slate-700 bg-slate-100">Mapel \ Kelas</th>
              {config.kelas.map(k => <th key={k} className="py-4 px-2 min-w-[80px] border-r font-bold text-slate-700">{k}</th>)}
            </tr>
          </thead>
          <tbody>
            {config.mapel.map(m => (
              <tr key={m} className="border-b hover:bg-slate-50 transition-colors">
                <td className="py-3 px-4 text-left font-bold text-slate-700 border-r bg-white">{m}</td>
                {config.kelas.map(k => {
                  const status = checkStatus(m, k);
                  return (
                    <td key={k} className="py-2 px-2 border-r">
                      <div className="flex justify-center gap-3">
                        <div className="flex flex-col items-center gap-1" title={status.hasFile ? "Naskah Sudah Diunggah" : "Naskah Belum Ada"}>
                           <FileText className={`w-3.5 h-3.5 ${status.hasFile ? 'text-indigo-500' : 'text-slate-200'}`}/>
                           {status.hasFile ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-red-200" />}
                        </div>
                        <div className="w-px h-8 bg-slate-100"></div>
                        <div className="flex flex-col items-center gap-1" title={status.hasLink ? "Link Sudah Disimpan" : "Link Belum Ada"}>
                           <LinkIcon className={`w-3.5 h-3.5 ${status.hasLink ? 'text-purple-500' : 'text-slate-200'}`}/>
                           {status.hasLink ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-red-200" />}
                        </div>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==========================================
// 10. ADMIN VIEW (Konfigurasi & User)
// ==========================================
const AdminConfigView = () => {
  const { state, dispatch } = useContext(AppContext);
  const [loading, setLoading] = useState(false);
  const [formConfig, setFormConfig] = useState({
    tahun: state.config.tahun.join(', '), semester: state.config.semester.join(', '),
    ujian: state.config.ujian.join(', '), mapel: state.config.mapel.join(', '), kelas: state.config.kelas.join(', ')
  });

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setLoading(true);
    const payload = {
      tahun: formConfig.tahun.split(',').map(s => s.trim()).filter(Boolean),
      semester: formConfig.semester.split(',').map(s => s.trim()).filter(Boolean),
      ujian: formConfig.ujian.split(',').map(s => s.trim()).filter(Boolean),
      mapel: formConfig.mapel.split(',').map(s => s.trim()).filter(Boolean),
      kelas: formConfig.kelas.split(',').map(s => s.trim()).filter(Boolean),
    };
    try {
      const data = await postToGas({ action: 'saveConfig', config: payload });
      if(data.status === 'success') {
        dispatch({ type: 'SET_CONFIG', payload: payload });
        dispatch({ type: 'SHOW_TOAST', payload: { message: "Konfigurasi Sistem berhasil disimpan!", type: "success" } });
      }
    } catch(err) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: "Gagal menyimpan konfigurasi", type: "error" } });
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-slide-in">
      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2"><Settings className="w-6 h-6 text-slate-600" /> Konfigurasi Sistem Dinamis</h2>
        <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm mb-6 flex items-start gap-3">
           <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
           <p>Gunakan tanda koma (,) untuk memisahkan setiap item. Hindari menggunakan karakter khusus aneh. Perubahan pada Mapel/Kelas akan langsung berdampak pada pilihan saat guru mengunggah soal.</p>
        </div>
        
        <form onSubmit={handleSaveConfig} className="space-y-5">
          {Object.keys(formConfig).map(key => (
            <div key={key}>
              <label className="block text-sm font-bold text-slate-700 mb-1.5 capitalize">Daftar {key}</label>
              <textarea required className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none bg-slate-50 focus:bg-white focus:border-slate-400 focus:ring-2 focus:ring-slate-200 transition" rows="2" 
                value={formConfig[key]} onChange={e => setFormConfig({...formConfig, [key]: e.target.value})} />
            </div>
          ))}
          <div className="pt-4 border-t border-slate-100">
             <button disabled={loading} type="submit" className="w-full md:w-auto px-8 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 shadow-md transition disabled:opacity-70 flex items-center justify-center gap-2">
               {loading ? <Spinner className="w-5 h-5" /> : <CheckCircle className="w-5 h-5"/>}
               {loading ? 'Menyimpan...' : 'Simpan Semua Konfigurasi'}
             </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AdminUserView = () => {
  const { state, dispatch } = useContext(AppContext);
  const [loading, setLoading] = useState(false);
  const [formUser, setFormUser] = useState({ username: '', password: '', role: 'gtk', namaLengkap: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [oldUsername, setOldUsername] = useState('');

  useEffect(() => {
    getFromGas('getUsers').then(data => dispatch({ type: 'SET_USERS', payload: data.users || [] })).catch(()=>{});
  }, [dispatch]);

  const handleSaveUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { action: 'saveUser', ...formUser };
      if(isEditing) payload.oldUsername = oldUsername;
      const data = await postToGas(payload);
      if (data.status === 'success') {
        dispatch({ type: 'SHOW_TOAST', payload: { message: isEditing ? "Pengguna diperbarui" : "Pengguna ditambah", type: "success" } });
        setFormUser({ username: '', password: '', role: 'gtk', namaLengkap: '' }); setIsEditing(false); setOldUsername('');
        getFromGas('getUsers').then(res => dispatch({ type: 'SET_USERS', payload: res.users || [] }));
      } else throw new Error(data.message || "Gagal menyimpan");
    } catch (error) { dispatch({ type: 'SHOW_TOAST', payload: { message: error.message, type: "error" } });
    } finally { setLoading(false); }
  };

  const handleDeleteUser = async (username) => {
    if (username === 'admin') return dispatch({ type: 'SHOW_TOAST', payload: { message: "Akun admin utama dilindungi!", type: "error" } });
    if (!confirm(`Hapus permanen akun ${username}?`)) return;
    dispatch({ type: 'SET_LOADING_DATA', payload: true });
    try {
      await postToGas({ action: 'deleteUser', username });
      getFromGas('getUsers').then(res => dispatch({ type: 'SET_USERS', payload: res.users || [] }));
      dispatch({ type: 'SHOW_TOAST', payload: { message: "Akun dihapus", type: "success" } });
    } catch (error) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: "Gagal menghapus", type: "error" } });
    } finally { 
      dispatch({ type: 'SET_LOADING_DATA', payload: false }); 
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-slide-in">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2 text-indigo-600">
           {isEditing ? <Edit className="w-6 h-6"/> : <Users className="w-6 h-6"/>} {isEditing ? 'Edit Data Pengguna' : 'Tambah Pengguna Baru'}
        </h2>
        <form onSubmit={handleSaveUser} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-slate-50 p-5 rounded-xl border border-slate-200">
          <div className="md:col-span-3">
             <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Username Login</label>
             <input required type="text" className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" value={formUser.username} onChange={e => setFormUser({...formUser, username: e.target.value})} />
          </div>
          <div className="md:col-span-4">
             <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Nama Lengkap & Gelar</label>
             <input required type="text" placeholder="Cth: Budi Santoso, S.Pd." className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" value={formUser.namaLengkap} onChange={e => setFormUser({...formUser, namaLengkap: e.target.value})} />
          </div>
          <div className="md:col-span-3">
             <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Password</label>
             <input required type="text" className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" value={formUser.password} onChange={e => setFormUser({...formUser, password: e.target.value})} />
          </div>
          <div className="md:col-span-2">
             <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Hak Akses</label>
             <select className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-indigo-500" value={formUser.role} onChange={e => setFormUser({...formUser, role: e.target.value})}>
                <option value="gtk">GTK / Guru</option>
                <option value="admin">Admin</option>
             </select>
          </div>
          <div className="md:col-span-12 flex gap-2 pt-2">
             <button disabled={loading} type="submit" className="flex-1 bg-indigo-600 text-white font-bold py-2.5 rounded-lg hover:bg-indigo-700 transition shadow-sm">
                {loading ? <Spinner className="w-5 h-5 mx-auto" /> : (isEditing ? 'Simpan Perubahan' : 'Tambahkan Akun')}
             </button>
             {isEditing && (
               <button type="button" onClick={() => {setFormUser({username:'', password:'', role:'gtk', namaLengkap: ''}); setIsEditing(false);}} className="bg-white border border-slate-300 text-slate-700 font-bold px-6 py-2.5 rounded-lg hover:bg-slate-50 transition">
                  Batal
               </button>
             )}
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
         <div className="p-4 border-b bg-white flex justify-between items-center">
            <h3 className="font-bold text-slate-800">Daftar Akun Sistem</h3>
            <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-semibold">{state.usersList.length} Akun Terdaftar</span>
         </div>
         <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
               <thead className="bg-slate-50 border-b">
                 <tr><th className="py-3 px-4 font-semibold text-slate-600">Nama Pengguna</th><th className="py-3 px-4 font-semibold text-slate-600">Username</th><th className="py-3 px-4 font-semibold text-slate-600">Akses</th><th className="py-3 px-4 text-right font-semibold text-slate-600">Aksi</th></tr>
               </thead>
               <tbody>
                  {state.usersList.map((u, i) => (
                     <tr key={i} className="border-b hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-800">
                           <div className="flex items-center gap-3">
                             <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs uppercase">
                               {u.namaLengkap ? u.namaLengkap.charAt(0) : u.username.charAt(0)}
                             </div>
                             {u.namaLengkap || '-'}
                           </div>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-600"><span className="bg-slate-100 px-2 py-1 rounded border border-slate-200 font-mono text-xs">{u.username}</span></td>
                        <td className="py-3 px-4"><span className={`px-2.5 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider ${u.role === 'admin' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}>{u.role}</span></td>
                        <td className="py-3 px-4 text-right">
                           <button onClick={() => {setFormUser(u); setIsEditing(true); setOldUsername(u.username);}} className="text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg text-xs font-bold mr-2 hover:bg-indigo-100 transition border border-indigo-100">Edit</button>
                           {u.username !== 'admin' ? (
                             <button onClick={() => handleDeleteUser(u.username)} className="text-red-600 bg-red-50 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 transition border border-red-100">Hapus</button>
                           ) : (
                             <span className="text-xs text-slate-400 font-semibold italic px-2">Dilindungi</span>
                           )}
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
};

// ==========================================
// 11. DASHBOARD WRAPPER (MAIN LAYOUT)
// ==========================================
const Dashboard = () => {
  const { state, dispatch } = useContext(AppContext);
  const [activeTab, setActiveTab] = useState('upload-foto');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    getFromGas('getConfig').then(data => { if(data && data.config) dispatch({ type: 'SET_CONFIG', payload: data.config }); }).catch(()=>{});
  }, [dispatch]);

  const NavButton = ({ id, icon: Icon, label, colorClass, iconColorClass }) => (
    <button 
      onClick={() => { setActiveTab(id); setIsSidebarOpen(false); }} 
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${activeTab === id ? `${colorClass} shadow-md` : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
    >
      <Icon className={`w-4.5 h-4.5 ${activeTab === id ? 'text-white' : iconColorClass}`} /> 
      {label}
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* Mobile Header */}
      <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center shadow-md z-20 relative">
         <div className="flex items-center gap-2 font-bold"><HardDrive className="w-5 h-5 text-blue-400"/> Portal Sekolah</div>
         <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 bg-slate-800 rounded-lg">
           <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={isSidebarOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}></path></svg>
         </button>
      </div>

      {/* Sidebar */}
      <aside className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:static inset-y-0 left-0 w-64 bg-slate-900 flex flex-col shrink-0 z-10 transition-transform duration-300 ease-in-out shadow-2xl md:shadow-none`}>
        <div className="p-6 border-b border-slate-800 flex items-center gap-3 bg-slate-950">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-inner">
            <span className="text-white font-bold text-lg">{state.user.namaLengkap ? state.user.namaLengkap.charAt(0) : state.user.username.charAt(0).toUpperCase()}</span>
          </div>
          <div className="overflow-hidden">
             <h1 className="font-bold text-white text-sm truncate" title={state.user.namaLengkap || state.user.username}>
               {state.user.namaLengkap || state.user.username}
             </h1>
             <p className="text-[10px] font-bold text-blue-400 mt-0.5 tracking-wider bg-blue-900/30 px-2 py-0.5 rounded-full w-max border border-blue-800/50">
               {state.user.role === 'admin' ? 'ADMINISTRATOR' : 'GURU / GTK'}
             </p>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scroll">
          <div className="text-[10px] font-bold text-slate-500 px-4 py-2 mt-2 uppercase tracking-wider">Modul Dokumentasi</div>
          <NavButton id="upload-foto" icon={UploadCloud} label="Unggah Foto" colorClass="bg-blue-600 text-white" iconColorClass="text-blue-400" />
          <NavButton id="galeri-foto" icon={Folder} label="Galeri Foto" colorClass="bg-blue-600 text-white" iconColorClass="text-blue-400" />

          <div className="text-[10px] font-bold text-slate-500 px-4 py-2 pt-6 uppercase tracking-wider">Modul Ujian</div>
          <NavButton id="upload-soal" icon={UploadCloud} label="Unggah Naskah" colorClass="bg-indigo-600 text-white" iconColorClass="text-indigo-400" />
          <NavButton id="arsip-soal" icon={BookOpen} label="Arsip Bank Soal" colorClass="bg-indigo-600 text-white" iconColorClass="text-indigo-400" />

          {state.user.role === 'admin' && (
            <>
              <div className="text-[10px] font-bold text-slate-500 px-4 py-2 pt-6 uppercase tracking-wider">Administrator</div>
              <NavButton id="pantau-soal" icon={ClipboardCheck} label="Pantau Soal" colorClass="bg-emerald-600 text-white" iconColorClass="text-emerald-400" />
              <NavButton id="admin-users" icon={Users} label="Kelola Akun" colorClass="bg-slate-700 text-white" iconColorClass="text-slate-400" />
              <NavButton id="admin-config" icon={Settings} label="Konfigurasi" colorClass="bg-slate-700 text-white" iconColorClass="text-slate-400" />
            </>
          )}
        </nav>
        
        <div className="p-4 bg-slate-950/50 mt-auto border-t border-slate-800/50">
          <button onClick={() => { if(confirm('Apakah Anda yakin ingin keluar?')) dispatch({type: 'LOGOUT'})}} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold text-red-400 hover:bg-red-500 hover:text-white rounded-xl border border-red-900/30 transition shadow-sm">
            <LogOut className="w-4 h-4" /> Keluar dari Sistem
          </button>
        </div>
      </aside>

      {/* Overlay untuk mobile sidebar */}
      {isSidebarOpen && <div className="fixed inset-0 bg-slate-900/50 z-0 md:hidden" onClick={() => setIsSidebarOpen(false)}></div>}

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto relative h-[calc(100vh-60px)] md:h-screen">
        <div className="max-w-7xl mx-auto">
          {activeTab === 'upload-foto' && <UploadFotoView />}
          {activeTab === 'galeri-foto' && <GaleriFotoView />}
          {activeTab === 'upload-soal' && <UploadSoalView />}
          {activeTab === 'arsip-soal' && <ArsipSoalView />}
          {activeTab === 'pantau-soal' && <PantauSoalView />}
          {activeTab === 'admin-users' && <AdminUserView />}
          {activeTab === 'admin-config' && <AdminConfigView />}
        </div>
      </main>
    </div>
  );
};

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return (
    <ErrorBoundary>
      <AppContext.Provider value={{ state, dispatch }}>
        <Toast />
        {state.user ? <Dashboard /> : <LoginView />}
      </AppContext.Provider>
    </ErrorBoundary>
  );
}
