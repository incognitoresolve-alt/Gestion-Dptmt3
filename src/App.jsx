import React, { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } from 'react';
import { auth, db } from './firebase';

const ToastContext = createContext(() => {});

// --- HELPERS ---
let _idCounter = 0;
const uid = () => `${Date.now()}_${++_idCounter}`;
const deptRef = (id) => db.collection('departments').doc(id);

const fmtDateTime = (ts) =>
  ts ? new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

const fmtRelative = (ts) => {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "A l'instant";
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
  return fmtDateTime(ts);
};

const stripHtml = (html) => {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};

// --- COMPOSANTS UI ---

const ConnectivityBadge = () => {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  const color = online ? 'var(--accent)' : 'var(--danger)';
  return (
    <div className="connectivity-badge" style={{ color, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '600' }}>
      <span className="connectivity-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }}></span>
      {online ? 'En ligne' : 'Hors ligne'}
    </div>
  );
};

const SavingIndicator = ({ saving }) =>
  saving ? <div className="saving-indicator" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted)' }}>Sauvegarde...</div> : null;

// --- LES ONGLETS (LOGIQUE MÉTIER) ---

const ProcedureTab = ({ dept, isAdmin, setSaving, addToast }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(dept.procedure || '');
  const quillRef = useRef(null);
  const quillInst = useRef(null);

  useEffect(() => { setContent(dept.procedure || ''); setIsEditing(false); }, [dept.id]);

  useEffect(() => {
    if (!isEditing || !quillRef.current || quillInst.current) return;
    const q = new window.Quill(quillRef.current, { theme: 'snow' });
    q.root.innerHTML = dept.procedure || '';
    q.on('text-change', () => setContent(q.root.innerHTML));
    quillInst.current = q;
  }, [isEditing]);

  const save = () => {
    setSaving(true);
    deptRef(dept.id).update({ procedure: content, updatedAt: Date.now() })
      .then(() => { setSaving(false); setIsEditing(false); addToast('Enregistré', 'success'); });
  };

  return (
    <div className="procedure-wrap">
      <div className="pdf-toolbar no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '20px' }}>
        <button className="btn btn-outline" onClick={() => window.print()}>PDF</button>
        {isAdmin && !isEditing && <button className="btn btn-primary" onClick={() => setIsEditing(true)}>Modifier</button>}
      </div>
      {isEditing ? (
        <div className="editor-container">
          <div ref={quillRef} style={{ minHeight: '300px', background: '#fff' }}></div>
          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button className="btn btn-outline" onClick={() => setIsEditing(false)}>Annuler</button>
            <button className="btn btn-primary" onClick={save}>Enregistrer</button>
          </div>
        </div>
      ) : (
        <div className="ql-editor" dangerouslySetInnerHTML={{ __html: dept.procedure || '<p>Aucune procédure.</p>' }}></div>
      )}
    </div>
  );
};

// --- FONCTION PRINCIPALE APP ---

export default function App() {
  const [role, setRole] = useState(null);
  const [departments, setDepts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState('procedure');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(user => {
      setRole(user ? 'RESPONSABLE' : (localStorage.getItem('guestaccess') === 'EQUIPE' ? 'EQUIPE' : 'NONE'));
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!role || role === 'NONE') return;
    return db.collection('departments').orderBy('createdAt', 'asc').onSnapshot(snap => {
      setDepts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, [role]);

  const activeDept = useMemo(() => departments.find(d => d.id === selectedId), [departments, selectedId]);

  if (role === 'NONE') return (
    <div className="login-screen" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--brand-violet)' }}>
       <button className="btn-equipe" onClick={() => { localStorage.setItem('guestaccess', 'EQUIPE'); window.location.reload(); }}>
         ✦ Accès équipe — Lecture seule ✦
       </button>
    </div>
  );

  return (
    <div className="app">
      <aside className="sidebar no-print">
        <div className="sidebar-logo">G-Dept <span style={{ color: 'var(--accent)' }}>Pro</span></div>
        <nav className="sidebar-nav">
          {departments.map(d => (
            <div key={d.id} className={`dept-item ${selectedId === d.id ? 'active' : ''}`} onClick={() => setSelectedId(d.id)}>
              {d.name}
            </div>
          ))}
        </nav>
      </aside>
      <main className="main">
        <header className="main-header">
          <h1 className="main-title">{activeDept?.name || "Sélectionnez un département"}</h1>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <SavingIndicator saving={saving} />
            <ConnectivityBadge />
          </div>
        </header>
        <div className="main-body">
          {activeDept ? (
            <ProcedureTab dept={activeDept} isAdmin={role === 'RESPONSABLE'} setSaving={setSaving} addToast={(m) => alert(m)} />
          ) : (
            <div className="empty-state">Sélectionnez un département dans le menu.</div>
          )}
        </div>
      </main>
    </div>
  );
}
