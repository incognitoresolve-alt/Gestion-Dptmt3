import React, { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } from 'react';
import { auth, db } from './firebase';

const ToastContext = createContext(() => {});

let _idCounter = 0;
const uid = () => `${Date.now()}_${++_idCounter}`;
const deptRef = (id) => db.collection('departments').doc(id);

const fmtDateTime = (ts) => ts ? new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const fmtRelative = (ts) => {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 0) return fmtDateTime(ts);
  if (diff < 60) return "A l'instant";
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)} j`;
  if (diff < 2592000) return `Il y a ${Math.floor(diff / 604800)} sem.`;
  return fmtDateTime(ts);
};

const stripHtml = (html) => {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const highlight = (text, query) => {
  if (!query || !query.trim()) return text;
  return text.split(new RegExp(`(${escapeRegex(query)})`, 'gi')).map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? <mark key={i} style={{ background: '#FEF08A', borderRadius: 2, padding: '0 1px' }}>{part}</mark> : part
  );
};

function useAutoSave(content, onSave, delay = 30000) {
  const timerRef = useRef(null);
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => {
    if (content == null) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSaveRef.current(content), delay);
    return () => clearTimeout(timerRef.current);
  }, [content, delay]);
}

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = uid();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300);
    }, duration);
  }, []);
  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="toast-container no-print" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}${t.exiting ? ' toast-exit' : ''}`} role="alert">
            <span className="toast-dot" aria-hidden="true"></span>{t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ConfirmModal({ open, title, message, onConfirm, onCancel, confirmText = 'Confirmer', cancelText = 'Annuler', danger = false }) {
  if (!open) return null;
  return (
    <div className="modal-overlay no-print" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <div className="modal-message">{message}</div>
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onCancel}>{cancelText}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

function AdminCodeModal({ open, onConfirm, onCancel }) {
  const [code, setCode] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { if (open) { setCode(''); setTimeout(() => inputRef.current?.focus(), 50); } }, [open]);
  if (!open) return null;
  return (
    <div className="modal-overlay no-print" onClick={onCancel}>
      <div className="admin-code-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Validation admin</div>
        <div className="modal-message">Entrez le code admin du departement pour valider cette tache.</div>
        <input ref={inputRef} className="input" type="password" placeholder="Code admin" value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && onConfirm(code)} />
        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-outline" onClick={onCancel}>Annuler</button>
          <button className="btn btn-primary" onClick={() => onConfirm(code)}>Valider</button>
        </div>
      </div>
    </div>
  );
}

const ConnectivityBadge = () => {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  const color = online ? 'var(--accent)' : 'var(--danger)';
  return (
    <div className="connectivity-badge" style={{ color }}>
      <span className="connectivity-dot" style={{ background: color }}></span>{online ? 'En ligne' : 'Hors ligne'}
    </div>
  );
};

const SavingIndicator = ({ saving }) => saving ? <div className="saving-indicator"><span className="saving-spinner"></span><span>Sauvegarde...</span></div> : null;

const SearchBar = ({ departments, onSelect }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    const h = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    departments.forEach(d => {
      if (d.deletedAt) return;
      if (d.name.toLowerCase().includes(q)) out.push({ type: 'procedure', title: d.name, deptId: d.id, icon: '📁' });
      if (stripHtml(d.procedure).toLowerCase().includes(q)) out.push({ type: 'procedure', title: `Procedure ${d.name}`, deptId: d.id, icon: '📄' });
      (d.checklist || []).forEach(t => t.text.toLowerCase().includes(q) && out.push({ type: 'checklist', title: t.text, deptId: d.id, icon: '☑️' }));
      (d.pendingTasks || []).forEach(p => p.text.toLowerCase().includes(q) && out.push({ type: 'pending', title: p.text, deptId: d.id, icon: '⏳' }));
      (d.debriefings || []).forEach(ev => {
        if (ev.title.toLowerCase().includes(q)) out.push({ type: 'debriefing', title: `Debriefing ${ev.title}`, deptId: d.id, icon: '🗒️' });
        (ev.remarks || []).forEach(r => r.text.toLowerCase().includes(q) && out.push({ type: 'debriefing', title: r.text, deptId: d.id, icon: '💬' }));
      });
    });
    return out.slice(0, 10);
  }, [query, departments]);
  const pick = (r) => { onSelect(r.deptId, r.type); setOpen(false); setQuery(''); };
  return (
    <div className="search-wrap" ref={wrapRef}>
      <span className="search-icon">🔎</span>
      <input className="search-input" placeholder="Rechercher" value={query} onChange={e => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      {open && query.trim() && (
        <div className="search-dropdown">
          {results.length === 0 ? <div style={{ padding: 12, fontSize: 13, color: 'var(--muted)' }}>Aucun resultat</div> : results.map((r, i) => (
            <div key={i} className="search-result" onClick={() => pick(r)}>
              <span style={{ fontSize: 16 }}>{r.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}><div className="search-result-title">{highlight(r.title, query)}</div><div className="search-result-sub">{departments.find(d => d.id === r.deptId)?.name}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const DashboardView = ({ departments }) => {
  const active = useMemo(() => departments.filter(d => !d.deletedAt), [departments]);
  const { totalTasks, doneTasks, pendingCount, totalDebrief } = useMemo(() => ({
    totalTasks: active.reduce((s, d) => s + (d.checklist?.length || 0), 0),
    doneTasks: active.reduce((s, d) => s + (d.checklist?.filter(t => t.done).length || 0), 0),
    pendingCount: active.reduce((s, d) => s + (d.pendingTasks?.filter(t => t.status === 'pending').length || 0), 0),
    totalDebrief: active.reduce((s, d) => s + (d.debriefings?.length || 0), 0),
  }), [active]);
  const progressPct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const activities = useMemo(() =>
    active.flatMap(d => [
      d.updatedAt ? { text: `Procedure mise a jour — ${d.name}`, time: d.updatedAt, icon: '📄' } : null,
      ...(d.checklist || []).filter(t => t.done && t.checkedAt).map(t => ({ text: `Tache completee — ${t.text}`, time: t.checkedAt, icon: '✅' })),
      ...(d.pendingTasks || []).filter(t => t.status === 'archived' && t.validatedAt).map(t => ({ text: `Tache validee — ${t.text}`, time: t.validatedAt, icon: '🧾' })),
      ...(d.debriefings || []).filter(ev => ev.createdAt).map(ev => ({ text: `Debriefing cree — ${ev.title}`, time: ev.createdAt, icon: '🗒️' })),
      ...(d.debriefings || []).flatMap(ev => (ev.remarks || []).filter(r => r.createdAt).map(r => ({ text: `Remarque sur ${ev.title}`, time: r.createdAt, icon: '💬' }))),
    ]).filter(Boolean).sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, 8), [active]);
  return (
    <div className="dashboard-grid">
      <div className="dashboard-card"><h4>Vue d'ensemble</h4>
        <div className="stat-row"><span className="stat-label">Departements actifs</span><span className="stat-value">{active.length}</span></div>
        <div className="stat-row"><span className="stat-label">Taches au total</span><span className="stat-value">{totalTasks}</span></div>
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${progressPct}%` }}></div></div>
      </div>
      <div className="dashboard-card"><h4>Alertes</h4>
        <div className="stat-row"><span className="stat-label">En attente de validation</span><span className="stat-value" style={{ color: pendingCount ? 'var(--danger)' : 'var(--accent)' }}>{pendingCount}</span></div>
      </div>
      <div className="dashboard-card"><h4>Activite recente</h4>
        {activities.map((a, i) => <div key={i} className="activity-item"><span className="activity-icon">{a.icon}</span><div><div className="activity-text">{a.text}</div><div className="activity-time">{fmtRelative(a.time)}</div></div></div>)}
      </div>
    </div>
  );
};

const ChecklistTab = ({ dept, isAdmin, setSaving, addToast, setModal }) => {
  const [input, setInput] = useState('');
  const dbUpdate = useCallback((data, msg) => {
    setSaving(true); return deptRef(dept.id).update(data).then(() => { setSaving(false); addToast(msg, 'success'); }).catch(() => { setSaving(false); addToast('Erreur', 'error'); });
  }, [dept.id, setSaving, addToast]);
  const addTask = () => { if (!input.trim()) return; dbUpdate({ checklist: [...(dept.checklist || []), { id: uid(), text: input.trim(), done: false, createdAt: Date.now() }] }, 'Tache ajoutee').then(() => setInput('')); };
  const toggle = (taskId) => {
    const now = Date.now();
    const newList = (dept.checklist || []).map(t => t.id === taskId ? { ...t, done: !t.done, checkedAt: !t.done ? now : null } : t);
    dbUpdate({ checklist: newList }, newList.find(t => t.id === taskId)?.done ? 'Tache completee' : 'Tache reactivee');
  };
  const remove = (taskId) => setModal({ open: true, title: 'Supprimer', message: 'Irreversible.', danger: true, onConfirm: () => { deptRef(dept.id).update({ checklist: (dept.checklist || []).filter(t => t.id !== taskId) }).then(() => { addToast('Supprime', 'success'); setModal(null); }); } });
  const pending = (dept.checklist || []).filter(t => !t.done); const done = (dept.checklist || []).filter(t => t.done);
  return (
    <div className="checklist-wrap">
      {isAdmin && <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}><input className="input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTask()} placeholder="Nouvelle tache" /><button className="btn btn-primary" onClick={addTask}>Ajouter</button></div>}
      <div className="section-title">En cours</div>
      {pending.map(t => <div key={t.id} className="task-item"><input type="checkbox" className="task-checkbox" checked={false} onChange={() => toggle(t.id)} /><label className="task-label" onClick={() => toggle(t.id)}>{t.text}</label>{isAdmin && <button className="btn-icon" onClick={() => remove(t.id)}>🗑️</button>}</div>)}
      <div className="section-title" style={{ marginTop: 32 }}>Completees</div>
      {done.map(t => <div key={t.id} className="task-item done"><input type="checkbox" className="task-checkbox" checked={true} onChange={() => toggle(t.id)} /><label className="task-label done" onClick={() => toggle(t.id)}>{t.text}</label>{isAdmin && <button className="btn-icon" onClick={() => remove(t.id)}>🗑️</button>}</div>)}
    </div>
  );
};

const PendingTab = ({ dept, isAdmin, setSaving, addToast, setModal }) => {
  const [input, setInput] = useState(''); const [codeModal, setCodeModal] = useState({ open: false, taskId: null });
  const addRemark = () => { if (!input.trim()) return; setSaving(true); deptRef(dept.id).update({ pendingTasks: [...(dept.pendingTasks || []), { id: uid(), text: input.trim(), status: 'pending', createdAt: Date.now() }] }).then(() => { setSaving(false); setInput(''); addToast('Ajoute', 'success'); }); };
  const confirmValidate = (code) => {
    if (code !== '0000') return addToast('Code incorrect', 'error');
    const updated = (dept.pendingTasks || []).map(t => t.id === codeModal.taskId ? { ...t, status: 'archived', validatedAt: Date.now() } : t);
    setCodeModal({ open: false, taskId: null }); setSaving(true); deptRef(dept.id).update({ pendingTasks: updated }).then(() => { setSaving(false); addToast('Valide', 'success'); });
  };
  const tasks = dept.pendingTasks || []; const pending = tasks.filter(t => t.status === 'pending'); const archived = tasks.filter(t => t.status === 'archived');
  return (
    <div className="pending-wrap">
      <AdminCodeModal open={codeModal.open} onConfirm={confirmValidate} onCancel={() => setCodeModal({ open: false, taskId: null })} />
      {isAdmin && <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}><input className="input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addRemark()} placeholder="Nouvelle remarque" /><button className="btn btn-primary" onClick={addRemark}>Ajouter</button></div>}
      <div className="section-title">Remarques en cours</div>
      {pending.map(t => <div key={t.id} className="task-item"><span className="task-label">{t.text}</span><button className="btn btn-success" onClick={() => setCodeModal({ open: true, taskId: t.id })}>Valider</button></div>)}
    </div>
  );
};

const ProcedureTab = ({ dept, isAdmin, setSaving, addToast }) => {
  const [isEditing, setIsEditing] = useState(false); const [content, setContent] = useState(dept.procedure || '');
  const quillRef = useRef(null); const quillInst = useRef(null);
  useEffect(() => { setContent(dept.procedure || ''); setIsEditing(false); quillInst.current = null; }, [dept.id]);
  useEffect(() => {
    if (!isEditing || !quillRef.current || quillInst.current) return;
    const q = new window.Quill(quillRef.current, { theme: 'snow', modules: { toolbar: [[{ header: [1, 2, 3, false] }], ['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['clean']] } });
    q.root.innerHTML = dept.procedure || ''; q.on('text-change', () => setContent(q.root.innerHTML)); quillInst.current = q;
  }, [isEditing]);
  const save = () => { setSaving(true); deptRef(dept.id).update({ procedure: quillInst.current.root.innerHTML, updatedAt: Date.now() }).then(() => { setSaving(false); setIsEditing(false); addToast('Sauvegarde', 'success'); }); };
  if (!isEditing) return (
    <div className="procedure-wrap">
      <div className="pdf-toolbar no-print"><div className="pdf-actions"><button className="btn btn-outline" onClick={() => window.print()}>PDF</button>{isAdmin && <button className="btn btn-primary" onClick={() => setIsEditing(true)}>Modifier</button>}</div></div>
      <div className="pdf-content ql-editor" dangerouslySetInnerHTML={{ __html: dept.procedure || '<p>Aucune procedure</p>' }} />
    </div>
  );
  return (
    <div className="procedure-wrap"><div className="editor-wrap"><div ref={quillRef}></div></div><div className="editor-actions"><button className="btn btn-outline" onClick={() => setIsEditing(false)}>Annuler</button><button className="btn btn-primary" onClick={save}>Enregistrer</button></div></div>
  );
};

const DebriefingTab = ({ dept, departments, isAdmin, setSaving, addToast, setModal }) => {
  return <div className="debrief-wrap"><div className="empty-state">Debriefings</div></div>;
};
const TrashView = ({ departments, isAdmin, addToast }) => { return <div className="trash-wrap"><div className="empty-state">Corbeille</div></div>; };
const GlobalDebriefView = ({ departments }) => { return <div className="empty-state">Debriefings Globaux</div>; };
const LoginScreen = ({ onGuest }) => {
  const login = async e => { e.preventDefault(); try { await auth.signInWithEmailAndPassword(e.target[0].value, e.target[1].value); } catch (err) { alert(err.message); } };
  return (
    <div className="login-screen"><div className="login-card"><div className="login-logo">G-Dept Pro</div><button className="btn-equipe" onClick={onGuest}>Accès équipe</button>
    <form className="login-form" onSubmit={login} style={{marginTop: 20}}><input className="input" type="email" placeholder="Email" /><input className="input" type="password" placeholder="Mot de passe" /><button className="btn btn-primary" type="submit">Connexion</button></form></div></div>
  );
};

const TABS = [{ key: 'procedure', label: 'Procedure' }, { key: 'checklist', label: 'Checklist' }, { key: 'pending', label: 'En cours' }, { key: 'debriefing', label: 'Debriefing' }];

function App() {
  const [role, setRole] = useState(null); const [departments, setDepts] = useState([]);
  const [selectedId, setSelectedId] = useState(null); const [activeTab, setActiveTab] = useState('procedure');
  const [menuOpen, setMenuOpen] = useState(false); const [saving, setSaving] = useState(false); const [modal, setModal] = useState(null);
  const addToast = useContext(ToastContext);

  useEffect(() => { return auth.onAuthStateChanged(user => { setRole(user ? 'RESPONSABLE' : (localStorage.getItem('guestaccess') === 'EQUIPE' ? 'EQUIPE' : 'NONE')); }); }, []);
  useEffect(() => { if (role && role !== 'NONE') return db.collection('departments').orderBy('createdAt', 'asc').onSnapshot(snap => setDepts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })))); }, [role]);

  const isAdmin = role === 'RESPONSABLE';
  const activeDepts = useMemo(() => departments.filter(d => !d.deletedAt), [departments]);
  const activeDept = useMemo(() => activeDepts.find(d => d.id === selectedId), [activeDepts, selectedId]);

  if (role === null) return <div>Chargement...</div>;
  if (role === 'NONE') return <LoginScreen onGuest={() => { localStorage.setItem('guestaccess', 'EQUIPE'); window.location.reload(); }} />;

  return (
    <div className="app">
      <aside className={`sidebar no-print ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">G-Dept Pro</div>
        <nav className="sidebar-nav">
          <div className="dept-item" onClick={() => setSelectedId('DASHBOARD')}><span className="dept-item-name">Vue d'ensemble</span></div>
          <div className="sidebar-divider"></div>
          {activeDepts.map(d => <div key={d.id} className={`dept-item ${selectedId === d.id ? 'active' : ''}`} onClick={() => { setSelectedId(d.id); setActiveTab('procedure'); }}>{d.name}</div>)}
        </nav>
        <div className="sidebar-footer"><button className="btn btn-danger" onClick={() => auth.signOut().then(() => { localStorage.removeItem('guestaccess'); window.location.reload(); })}>Déconnexion</button></div>
      </aside>
      <main className="main">
        <header className="main-header no-print">
          <h1 className="main-title">{activeDept ? activeDept.name : (selectedId === 'DASHBOARD' ? "Vue d'ensemble" : "Sélectionnez un département")}</h1>
          <div style={{ display: 'flex', gap: '15px' }}><SavingIndicator saving={saving} /><ConnectivityBadge /></div>
        </header>
        {activeDept && (
          <div className="main-header no-print" style={{ paddingTop: 0, paddingBottom: 12 }}>
            <nav className="tabs">{TABS.map(({ key, label }) => <button key={key} className={`tab-btn ${activeTab === key ? 'active' : ''}`} onClick={() => setActiveTab(key)}>{label}</button>)}</nav>
          </div>
        )}
        <div className="main-body">
          {selectedId === 'DASHBOARD' && <DashboardView departments={departments} />}
          {activeDept && activeTab === 'procedure' && <ProcedureTab dept={activeDept} isAdmin={isAdmin} setSaving={setSaving} addToast={addToast} />}
          {activeDept && activeTab === 'checklist' && <ChecklistTab dept={activeDept} isAdmin={isAdmin} setSaving={setSaving} addToast={addToast} setModal={setModal} />}
          {activeDept && activeTab === 'pending' && <PendingTab dept={activeDept} isAdmin={isAdmin} setSaving={setSaving} addToast={addToast} setModal={setModal} />}
        </div>
      </main>
      <ConfirmModal open={modal?.open || false} title={modal?.title} message={modal?.message} danger={modal?.danger} onConfirm={modal?.onConfirm || (() => setModal(null))} onCancel={() => setModal(null)} />
    </div>
  );
}

export default function Root() { return <ToastProvider><App /></ToastProvider>; }
