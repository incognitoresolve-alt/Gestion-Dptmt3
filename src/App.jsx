import React, { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } from 'react';
import { auth, db } from './firebase';

const ToastContext = createContext(() => {});

const fmtDateTime = (ts) =>
  ts ? new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

const fmtRelative = (ts) => {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 0)       return fmtDateTime(ts);
  if (diff < 60)      return "A l'instant";
  if (diff < 3600)    return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400)   return `Il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 604800)  return `Il y a ${Math.floor(diff / 86400)} j`;
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
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} style={{ background: '#FEF08A', borderRadius: 2, padding: '0 1px' }}>{part}</mark>
      : part
  );
};

let _idCounter = 0;
const uid = () => `${Date.now()}_${++_idCounter}`;
const deptRef = (id) => db.collection('departments').doc(id);

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
            <span className="toast-dot" aria-hidden="true"></span>
            {t.message}
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
  useEffect(() => {
    if (open) { setCode(''); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-overlay no-print" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="admin-code-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Validation admin</div>
        <div className="modal-message">Entrez le code admin du departement pour valider cette tache.</div>
        <input ref={inputRef} className="input" type="password" placeholder="Code admin"
          value={code} onChange={e => setCode(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onConfirm(code)} />
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
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  const color = online ? 'var(--accent)' : 'var(--danger)';
  return (
    <div className="connectivity-badge" style={{ color }}>
      <span className="connectivity-dot" style={{ background: color }}></span>
      {online ? 'En ligne' : 'Hors ligne'}
    </div>
  );
};

const SavingIndicator = ({ saving }) =>
  saving ? <div className="saving-indicator"><span className="saving-spinner"></span><span>Sauvegarde...</span></div> : null;

const SearchBar = ({ departments, onSelect }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const h = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    departments.forEach(d => {
      if (d.deletedAt) return;
      if (d.name.toLowerCase().includes(q))
        out.push({ type: 'procedure', title: d.name, deptId: d.id, icon: '📁' });
      if (stripHtml(d.procedure).toLowerCase().includes(q))
        out.push({ type: 'procedure', title: `Procedure ${d.name}`, deptId: d.id, icon: '📄' });
      (d.checklist || []).forEach(t =>
        t.text.toLowerCase().includes(q) && out.push({ type: 'checklist', title: t.text, deptId: d.id, icon: '☑️' }));
      (d.pendingTasks || []).forEach(p =>
        p.text.toLowerCase().includes(q) && out.push({ type: 'pending', title: p.text, deptId: d.id, icon: '⏳' }));
      (d.debriefings || []).forEach(ev => {
        if (ev.title.toLowerCase().includes(q))
          out.push({ type: 'debriefing', title: `Debriefing ${ev.title}`, deptId: d.id, icon: '🗒️' });
        (ev.remarks || []).forEach(r =>
          r.text.toLowerCase().includes(q) && out.push({ type: 'debriefing', title: r.text, deptId: d.id, icon: '💬' }));
      });
    });
    return out.slice(0, 10);
  }, [query, departments]);

  const close = () => { setOpen(false); setQuery(''); };
  const pick = (r) => { onSelect(r.deptId, r.type); close(); };

  return (
    <div className="search-wrap" ref={wrapRef}>
      <span className="search-icon">🔎</span>
      <input className="search-input" placeholder="Rechercher" value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        aria-label="Rechercher dans l'application" autoComplete="off" />
      {open && query.trim() && (
        <div className="search-dropdown" role="listbox">
          {results.length === 0
            ? <div style={{ padding: 12, fontSize: 13, color: 'var(--muted)' }}>Aucun resultat</div>
            : results.map((r, i) => (
              <div key={i} className="search-result" role="option" tabIndex={0}
                onClick={() => pick(r)}
                onKeyDown={e => e.key === 'Enter' && pick(r)}>
                <span style={{ fontSize: 16 }}>{r.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="search-result-title">{highlight(r.title, query)}</div>
                  <div className="search-result-sub">{departments.find(d => d.id === r.deptId)?.name}</div>
                </div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
};

const DashboardView = ({ departments }) => {
  const active = useMemo(() => departments.filter(d => !d.deletedAt), [departments]);

  const { totalTasks, doneTasks, pendingCount, totalDebrief } = useMemo(() => ({
    totalTasks:   active.reduce((s, d) => s + (d.checklist?.length || 0), 0),
    doneTasks:    active.reduce((s, d) => s + (d.checklist?.filter(t => t.done).length || 0), 0),
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
    ]).filter(Boolean).sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, 8),
  [active]);

  return (
    <div className="dashboard-grid">
      <div className="dashboard-card">
        <h4>Vue d'ensemble</h4>
        <div className="stat-row"><span className="stat-label">Departements actifs</span><span className="stat-value">{active.length}</span></div>
        <div className="stat-row"><span className="stat-label">Taches au total</span><span className="stat-value">{totalTasks}</span></div>
        <div className="stat-row" style={{ marginBottom: 14 }}><span className="stat-label">Evenements debrief</span><span className="stat-value">{totalDebrief}</span></div>
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${progressPct}%` }}></div></div>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--muted)' }}>
          <span>{doneTasks} faites</span><span>{totalTasks - doneTasks} restantes</span>
          <span style={{ marginLeft: 'auto' }}>{progressPct}%</span>
        </div>
      </div>
      <div className="dashboard-card">
        <h4>Alertes</h4>
        <div className="stat-row">
          <span className="stat-label">En attente de validation</span>
          <span className="stat-value" style={{ color: pendingCount ? 'var(--danger)' : 'var(--accent)' }}>{pendingCount}</span>
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          {pendingCount
            ? `${pendingCount} tache${pendingCount > 1 ? 's' : ''} necessite${pendingCount > 1 ? 'nt' : ''} une validation admin.`
            : 'Tout est a jour.'}
        </div>
      </div>
      <div className="dashboard-card">
        <h4>Activite recente</h4>
        {activities.length === 0
          ? <div style={{ fontSize: 13, color: 'var(--muted)' }}>Aucune activite recente.</div>
          : activities.map((a, i) => (
            <div key={i} className="activity-item">
              <span className="activity-icon" aria-hidden="true">{a.icon}</span>
              <div><div className="activity-text">{a.text}</div><div className="activity-time">{fmtRelative(a.time)}</div></div>
            </div>
          ))}
      </div>
    </div>
  );
};

const ChecklistTab = ({ dept, isAdmin, setSaving, addToast, setModal }) => {
  const [input, setInput] = useState('');

  const dbUpdate = useCallback((data, msg) => {
    setSaving(true);
    return deptRef(dept.id).update(data)
      .then(() => { setSaving(false); addToast(msg, 'success'); })
      .catch(() => { setSaving(false); addToast('Erreur', 'error'); });
  }, [dept.id, setSaving, addToast]);

  const addTask = () => {
    const v = input.trim();
    if (!v) return;
    const newList = [...(dept.checklist || []), { id: uid(), text: v, done: false, createdAt: Date.now() }];
    dbUpdate({ checklist: newList }, 'Tache ajoutee').then(() => setInput(''));
  };

  const toggle = (taskId) => {
    const now = Date.now();
    const newList = (dept.checklist || []).map(t =>
      t.id === taskId ? { ...t, done: !t.done, checkedAt: !t.done ? now : null } : t
    );
    const wasDone = newList.find(t => t.id === taskId)?.done;
    dbUpdate({ checklist: newList }, wasDone ? 'Tache completee' : 'Tache reactivee');
  };

  const remove = (taskId) => setModal({
    open: true, title: 'Supprimer la tache', message: 'Cette action est irreversible.', danger: true,
    onConfirm: () => {
      setSaving(true);
      deptRef(dept.id).update({ checklist: (dept.checklist || []).filter(t => t.id !== taskId) })
        .then(() => { setSaving(false); addToast('Tache supprimee', 'success'); setModal(null); })
        .catch(() => { setSaving(false); addToast('Erreur', 'error'); });
    },
    onCancel: () => setModal(null)
  });

  const list = dept.checklist || [];
  const pending = list.filter(t => !t.done);
  const done    = list.filter(t => t.done);

  return (
    <div className="checklist-wrap">
      {isAdmin && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <input className="input" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()} placeholder="Nouvelle tache" aria-label="Nouvelle tache" />
          <button className="btn btn-primary" onClick={addTask}>Ajouter</button>
        </div>
      )}
      {list.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">☑️</div>
          <div className="empty-state-title">Aucune tache</div>
          <div className="empty-state-text">{isAdmin ? 'Ajoutez votre premiere tache ci-dessus.' : 'Aucune tache definie pour ce departement.'}</div>
        </div>
      )}
      {pending.length > 0 && (
        <div>
          <div className="section-title">En cours <span className="badge badge-info">{pending.length}</span></div>
          {pending.map(t => (
            <div key={t.id} className="task-item">
              <input type="checkbox" className="task-checkbox" checked={false} onChange={() => toggle(t.id)} aria-label={`Marquer comme faite`} />
              <label className="task-label" onClick={() => toggle(t.id)}>{t.text}</label>
              {isAdmin && <button className="btn-icon" onClick={() => remove(t.id)} aria-label="Supprimer">🗑️</button>}
            </div>
          ))}
        </div>
      )}
      {done.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div className="section-title">Completees <span className="badge badge-success">{done.length}</span></div>
          {done.map(t => (
            <div key={t.id} className="task-item done">
              <input type="checkbox" className="task-checkbox" checked={true} onChange={() => toggle(t.id)} aria-label="Reactiver" />
              <label className="task-label done" onClick={() => toggle(t.id)}>{t.text}</label>
              <span className="task-meta">{fmtRelative(t.checkedAt)}</span>
              {isAdmin && <button className="btn-icon" onClick={() => remove(t.id)} aria-label="Supprimer">🗑️</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ADMIN_CODE = '0000';
const ARCHIVE_LIMIT_MS = 31 * 24 * 60 * 60 * 1000;

const PendingTab = ({ dept, isAdmin, setSaving, addToast, setModal }) => {
  const [input, setInput] = useState('');
  const [codeModal, setCodeModal] = useState({ open: false, taskId: null });
  const cleanedRef = useRef(false);

  useEffect(() => { cleanedRef.current = false; }, [dept.id]);

  useEffect(() => {
    if (cleanedRef.current) return;
    const now = Date.now();
    const current = dept.pendingTasks || [];
    const valid = current.filter(t => !(t.status === 'archived' && now - t.validatedAt > ARCHIVE_LIMIT_MS));
    if (valid.length !== current.length) {
      cleanedRef.current = true;
      setSaving(true);
      deptRef(dept.id).update({ pendingTasks: valid }).then(() => setSaving(false)).catch(() => setSaving(false));
    }
  }, [dept.id, dept.pendingTasks, setSaving]);

  const addRemark = () => {
    const v = input.trim();
    if (!v) return;
    setSaving(true);
    deptRef(dept.id).update({ pendingTasks: [...(dept.pendingTasks || []), { id: uid(), text: v, status: 'pending', createdAt: Date.now() }] })
      .then(() => { setSaving(false); setInput(''); addToast('Remarque ajoutee', 'success'); })
      .catch(() => { setSaving(false); addToast('Erreur', 'error'); });
  };

  const confirmValidate = (code) => {
    if (code !== ADMIN_CODE) { addToast('Code admin incorrect', 'error'); return; }
    const updated = (dept.pendingTasks || []).map(t =>
      t.id === codeModal.taskId ? { ...t, status: 'archived', validatedAt: Date.now() } : t
    );
    setCodeModal({ open: false, taskId: null });
    setSaving(true);
    deptRef(dept.id).update({ pendingTasks: updated })
      .then(() => { setSaving(false); addToast('Tache validee', 'success'); })
      .catch(() => { setSaving(false); addToast('Erreur', 'error'); });
  };

  const removeTask = (taskId) => setModal({
    open: true, title: 'Supprimer la remarque', message: 'Cette action est irreversible.', danger: true,
    onConfirm: () => {
      setSaving(true);
      deptRef(dept.id).update({ pendingTasks: (dept.pendingTasks || []).filter(t => t.id !== taskId) })
        .then(() => { setSaving(false); addToast('Supprime', 'success'); setModal(null); })
        .catch(() => { setSaving(false); addToast('Erreur', 'error'); });
    },
    onCancel: () => setModal(null)
  });

  const tasks    = dept.pendingTasks || [];
  const pending  = tasks.filter(t => t.status === 'pending');
  const archived = tasks.filter(t => t.status === 'archived').sort((a, b) => (b.validatedAt || 0) - (a.validatedAt || 0));

  return (
    <div className="pending-wrap">
      <AdminCodeModal open={codeModal.open} onConfirm={confirmValidate} onCancel={() => setCodeModal({ open: false, taskId: null })} />
      {isAdmin && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <input className="input" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addRemark()} placeholder="Nouvelle remarque" aria-label="Nouvelle remarque" />
          <button className="btn btn-primary" onClick={addRemark}>Ajouter</button>
        </div>
      )}
      <div className="section-title">Remarques en cours <span className="badge badge-danger">{pending.length}</span></div>
      {pending.length === 0
        ? <div className="empty-state" style={{ padding: '20px 0' }}><div className="empty-state-text">Aucune tache en attente.</div></div>
        : pending.map(t => (
          <div key={t.id} className="task-item">
            <span className="task-label">{t.text}</span>
            <button className="btn btn-success" onClick={() => setCodeModal({ open: true, taskId: t.id })}>Valider</button>
            {isAdmin && <button className="btn-icon" onClick={() => removeTask(t.id)}>🗑️</button>}
          </div>
        ))}
      <div className="section-title" style={{ marginTop: 36 }}>Archives valides <span className="badge badge-success">{archived.length}</span></div>
      {archived.length === 0
        ? <div className="empty-state" style={{ padding: '20px 0' }}><div className="empty-state-text">Aucune archive recente.</div></div>
        : archived.map(t => (
          <div key={t.id} className="task-item done" style={{ opacity: .65 }}>
            <span className="task-label">{t.text}</span>
            <span className="task-meta">Valide le {fmtDateTime(t.validatedAt)}</span>
            {isAdmin && <button className="btn-icon" onClick={() => removeTask(t.id)}>🗑️</button>}
          </div>
        ))}
    </div>
  );
};

const ProcedureTab = ({ dept, isAdmin, setSaving, addToast }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(dept.procedure || '');
  const quillRef  = useRef(null);
  const quillInst = useRef(null);

  useEffect(() => {
    setContent(dept.procedure || '');
    setIsEditing(false);
    quillInst.current = null;
  }, [dept.id]);

  const handleAutoSave = useCallback((html) => {
    if (html === dept.procedure) return;
    setSaving(true);
    deptRef(dept.id).update({ procedure: html, updatedAt: Date.now() })
      .then(() => { setSaving(false); addToast('Sauvegarde auto effectuee', 'success'); })
      .catch(() => { setSaving(false); addToast('Erreur de sauvegarde auto', 'error'); });
  }, [dept.id, dept.procedure, setSaving, addToast]);

  useAutoSave(isEditing ? content : null, handleAutoSave, 30000);

  useEffect(() => {
    if (!isEditing || !quillRef.current || quillInst.current) return;
    // Modification importante : Utilisation de window.Quill pour fonctionner dans Vite
    const q = new window.Quill(quillRef.current, {
      theme: 'snow',
      modules: { toolbar: [[{ header: [1, 2, 3, false] }], ['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['blockquote', 'link'], ['clean']] }
    });
    q.root.innerHTML = dept.procedure || '';
    q.on('text-change', () => setContent(q.root.innerHTML));
    quillInst.current = q;
  }, [isEditing, dept.procedure]);

  const save = useCallback(() => {
    if (!quillInst.current) return;
    setSaving(true);
    const html = quillInst.current.root.innerHTML;
    deptRef(dept.id).update({ procedure: html, updatedAt: Date.now() })
      .then(() => { setSaving(false); quillInst.current = null; setIsEditing(false); addToast('Procedure enregistree', 'success'); })
      .catch(() => { setSaving(false); addToast('Erreur de sauvegarde', 'error'); });
  }, [dept.id, setSaving, addToast]);

  const cancelEdit = useCallback(() => {
    quillInst.current = null;
    setContent(dept.procedure || '');
    setIsEditing(false);
  }, [dept.procedure]);

  useEffect(() => {
    if (!isEditing) return;
    const h = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isEditing, save]);

  if (!isEditing) return (
    <div className="procedure-wrap">
      <div className="pdf-toolbar no-print">
        <div className="pdf-meta">{dept.updatedAt ? `Mis a jour ${fmtRelative(dept.updatedAt)}` : ''}</div>
        <div className="pdf-actions">
          <button className="btn btn-outline" onClick={() => window.print()}>PDF</button>
          {isAdmin && <button className="btn btn-primary" onClick={() => setIsEditing(true)}>Modifier</button>}
        </div>
      </div>
      <div className="pdf-header">
        <div className="pdf-doc-label">Document interne — Procedure</div>
        <div className="pdf-doc-title">{dept.name}</div>
      </div>
      <div className="pdf-content ql-editor" style={{ padding: 0, fontSize: 15 }}
        dangerouslySetInnerHTML={{ __html: dept.procedure || '<p style="color:#94A3B8;font-style:italic">Aucune procedure redigee pour ce departement.</p>' }} />
    </div>
  );

  return (
    <div className="procedure-wrap">
      <div className="editor-wrap"><div ref={quillRef}></div></div>
      <div className="editor-actions no-print">
        <button className="btn btn-outline" onClick={cancelEdit}>Annuler</button>
        <button className="btn btn-primary" onClick={save}>Enregistrer <span style={{ fontSize: 11, opacity: .75, marginLeft: 4 }}>Ctrl+S</span></button>
      </div>
    </div>
  );
};

const DebriefingTab = ({ dept, departments, isAdmin, setSaving, addToast, setModal }) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [desc, setDesc] = useState('');
  const [selectedDepts, setSelectedDepts] = useState(() => [dept.id]);
  const [remarkInputs, setRemarkInputs] = useState({});

  const activeDepartments = useMemo(() => (departments || []).filter(d => !d.deletedAt), [departments]);
  const activeDeptIds = useMemo(() => activeDepartments.map(d => d.id), [activeDepartments]);

  useEffect(() => {
    setSelectedDepts(prev => {
      const valid = prev.filter(id => activeDeptIds.includes(id));
      return valid.length ? valid : [dept.id];
    });
  }, [dept.id, activeDeptIds]);

  const toggleDepartment = useCallback((id) => {
    setSelectedDepts(prev => {
      if (prev.includes(id)) {
        const next = prev.filter(x => x !== id);
        return next.length ? next : [dept.id];
      }
      return [...prev, id];
    });
  }, [dept.id]);

  const resetForm = useCallback(() => {
    setTitle(''); setDate(''); setDesc(''); setSelectedDepts([dept.id]);
  }, [dept.id]);

  const addDebriefing = () => {
    const vTitle = title.trim();
    const vDesc  = desc.trim();
    if (!vTitle || !vDesc || !date) {
      addToast('Veuillez remplir le titre, la date et la description.', 'error');
      return;
    }
    const payload = {
      id: uid(),
      title: vTitle,
      date: new Date(date).getTime(),
      desc: vDesc,
      departments: [...new Set(selectedDepts.length ? selectedDepts : [dept.id])],
      remarks: [],
      createdAt: Date.now()
    };
    setSaving(true);
    deptRef(dept.id).update({ debriefings: [...(dept.debriefings || []), payload] })
      .then(() => { setSaving(false); resetForm(); addToast('Debriefing ajoute', 'success'); })
      .catch(() => { setSaving(false); addToast("Erreur lors de l'ajout", 'error'); });
  };

  const removeDebriefing = (debriefId) => setModal({
    open: true, title: 'Supprimer le debriefing', message: 'Cette action est irreversible.', danger: true,
    onConfirm: () => {
      setSaving(true);
      deptRef(dept.id).update({ debriefings: (dept.debriefings || []).filter(ev => ev.id !== debriefId) })
        .then(() => { setSaving(false); addToast('Debriefing supprime', 'success'); setModal(null); })
        .catch(() => { setSaving(false); addToast('Erreur lors de la suppression', 'error'); });
    },
    onCancel: () => setModal(null)
  });

  const addRemark = (debriefId) => {
    const text = (remarkInputs[debriefId] || '').trim();
    if (!text) return;
    const now = Date.now();
    const updated = (dept.debriefings || []).map(ev =>
      ev.id === debriefId
        ? { ...ev, remarks: [...(ev.remarks || []), { id: uid(), text, createdAt: now }] }
        : ev
    );
    setSaving(true);
    deptRef(dept.id).update({ debriefings: updated })
      .then(() => { setSaving(false); setRemarkInputs(prev => ({ ...prev, [debriefId]: '' })); addToast('Remarque ajoutee', 'success'); })
      .catch(() => { setSaving(false); addToast("Erreur lors de l'ajout", 'error'); });
  };

  const removeRemark = (debriefId, remarkId) => setModal({
    open: true, title: 'Supprimer la remarque', message: 'Cette action est irreversible.', danger: true,
    onConfirm: () => {
      const updated = (dept.debriefings || []).map(ev =>
        ev.id === debriefId ? { ...ev, remarks: (ev.remarks || []).filter(r => r.id !== remarkId) } : ev
      );
      setSaving(true);
      deptRef(dept.id).update({ debriefings: updated })
        .then(() => { setSaving(false); addToast('Remarque supprimee', 'success'); setModal(null); })
        .catch(() => { setSaving(false); addToast('Erreur lors de la suppression', 'error'); });
    },
    onCancel: () => setModal(null)
  });

  const debriefings = useMemo(() =>
    (dept.debriefings || []).slice().sort((a, b) => (b.date || 0) - (a.date || 0)),
  [dept.debriefings]);

  return (
    <div className="debrief-wrap">
      {isAdmin && (
        <div className="dashboard-card" style={{ marginBottom: 24 }}>
          <div className="section-title">Creer un debriefing</div>
          <div style={{ display: 'grid', gap: 12 }}>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre du debriefing" />
            <input className="input" type="datetime-local" value={date} onChange={e => setDate(e.target.value)} />
            <textarea className="input" style={{ minHeight: 100, resize: 'vertical' }}
              value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description du debriefing" />
            <div>
              <div className="section-title" style={{ marginBottom: 10 }}>Departements concernes</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {activeDepartments.map(d => (
                  <button key={d.id} type="button"
                    className={`btn ${selectedDepts.includes(d.id) ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => toggleDepartment(d.id)}>
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="editor-actions">
              <button className="btn btn-outline" onClick={resetForm}>Reinitialiser</button>
              <button className="btn btn-primary" onClick={addDebriefing}>Ajouter</button>
            </div>
          </div>
        </div>
      )}

      {debriefings.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🗒️</div>
          <div className="empty-state-title">Aucun debriefing</div>
          <div className="empty-state-text">
            {isAdmin ? 'Creez le premier debriefing ci-dessus.' : 'Aucun debriefing disponible pour ce departement.'}
          </div>
        </div>
      ) : (
        debriefings.map(ev => {
          const evDepts = (ev.departments || []).map(id => activeDepartments.find(d => d.id === id)).filter(Boolean);
          return (
            <div key={ev.id} className="debrief-card">
              <div className="debrief-card-header">
                <div>
                  <div className="debrief-title">{ev.title}</div>
                  <div className="debrief-meta">{fmtDateTime(ev.date)}</div>
                </div>
                {isAdmin && <button className="btn-icon" onClick={() => removeDebriefing(ev.id)}>🗑️</button>}
              </div>

              <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--muted)' }}>
                <strong>Departements concernes :</strong>{' '}
                {evDepts.length > 0
                  ? <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', marginLeft: 6 }}>
                      {evDepts.map(d => <span key={d.id} className="badge badge-info">{d.name}</span>)}
                    </span>
                  : 'Aucun'}
              </div>

              {ev.desc && <div style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>{ev.desc}</div>}

              {(ev.remarks || []).length > 0 && (
                <div className="remark-list">
                  {ev.remarks.map(r => (
                    <div key={r.id} className="remark-item">
                      <div className="remark-text">{r.text}</div>
                      <div className="remark-meta">
                        <span className="remark-time">{fmtRelative(r.createdAt)}</span>
                        {isAdmin && <button className="btn-icon" onClick={() => removeRemark(ev.id, r.id)}>🗑️</button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="remark-form">
                <input className="input" value={remarkInputs[ev.id] || ''}
                  onChange={e => setRemarkInputs(prev => ({ ...prev, [ev.id]: e.target.value }))}
                  placeholder="Ajouter une remarque"
                  onKeyDown={e => e.key === 'Enter' && addRemark(ev.id)} />
                <button className="btn btn-primary" onClick={() => addRemark(ev.id)}>Ajouter</button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

const TrashView = ({ departments, isAdmin, addToast }) => {
  const deleted = useMemo(() => departments.filter(d => d.deletedAt), [departments]);
  const restore = (id, name) =>
    deptRef(id).update({ deletedAt: null }).then(() => addToast(`Departement ${name} restaure`, 'success'));
  return (
    <div className="trash-wrap">
      {deleted.length === 0
        ? <div className="empty-state"><div className="empty-state-icon">🗑️</div><div className="empty-state-title">Corbeille vide</div><div className="empty-state-text">Les departements archives apparaissent ici.</div></div>
        : deleted.map(d => (
          <div key={d.id} className="trash-item">
            <span style={{ fontSize: 14, fontWeight: 600 }}>{d.name}</span>
            {isAdmin && <button className="btn btn-outline" onClick={() => restore(d.id, d.name)}>Restaurer</button>}
          </div>
        ))}
    </div>
  );
};

const SPARKS = [
  { top: '12%', left: '8%',  delay: '0s'   },
  { top: '18%', left: '88%', delay: '.4s'  },
  { top: '72%', left: '5%',  delay: '.8s'  },
  { top: '78%', left: '92%', delay: '1.2s' },
  { top: '45%', left: '95%', delay: '1.6s' },
  { top: '50%', left: '2%',  delay: '2s'   },
];

function LoginScreen({ onGuest }) {
  const [email, setEmail] = useState('');
  const [pass, setPass]   = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy]   = useState(false);
  const login = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try { await auth.signInWithEmailAndPassword(email, pass); }
    catch (err) {
      setError(['auth/wrong-password', 'auth/user-not-found', 'auth/invalid-credential'].includes(err.code)
        ? 'Email ou mot de passe incorrect.' : err.message);
    } finally { setBusy(false); }
  };
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">G-Dept <span style={{ color: 'var(--accent)' }}>Pro</span></div>

        <button className="btn-equipe" onClick={onGuest} aria-label="Acces equipe lecture seule">
          {SPARKS.map((s, i) => (
            <span key={i} className="spark" style={{ top: s.top, left: s.left, animationDelay: s.delay }}>✦</span>
          ))}
          ✦ &nbsp;Accès équipe — Lecture seule&nbsp; ✦
        </button>

        <div className="login-divider">Responsable</div>
        <form className="login-form" onSubmit={login} noValidate>
          <input className="input" type="email" placeholder="Email" value={email}
            onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          <input className="input" type="password" placeholder="Mot de passe" value={pass}
            onChange={e => setPass(e.target.value)} required autoComplete="current-password" />
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="btn btn-primary" style={{ padding: '12px', fontSize: 15 }} type="submit" disabled={busy}>
            {busy ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}

const GlobalDebriefView = ({ departments }) => {
  const allActiveDepts = useMemo(() =>
    departments.filter(d => !d.deletedAt),
  [departments]);

  const activeDepts = useMemo(() =>
    allActiveDepts.filter(d => (d.debriefings || []).length > 0),
  [allActiveDepts]);

  const allDebriefs = useMemo(() =>
    activeDepts.flatMap(d =>
      (d.debriefings || []).map(ev => ({ ...ev, deptName: d.name, deptId: d.id }))
    ).sort((a, b) => (b.date || 0) - (a.date || 0)),
  [activeDepts]);

  if (allDebriefs.length === 0) return (
    <div className="empty-state" style={{ flex: 1, paddingTop: 80 }}>
      <div className="empty-state-icon">🗒️</div>
      <div className="empty-state-title">Aucun debriefing disponible</div>
      <div className="empty-state-text">Les debriefings encodes par l'admin apparaitront ici.</div>
    </div>
  );

  const byDept = activeDepts.map(d => ({
    id: d.id,
    name: d.name,
    debriefs: (d.debriefings || []).slice().sort((a, b) => (b.date || 0) - (a.date || 0))
  })).filter(d => d.debriefs.length > 0);

  const resolveDeptNames = (ids) =>
    (ids || [])
      .map(id => allActiveDepts.find(d => d.id === id))
      .filter(Boolean)
      .map(d => d.name);

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="global-debrief-header">
        <div style={{ fontSize: 36 }}>🗒️</div>
        <div>
          <h2>Notes de debriefing</h2>
          <p>{allDebriefs.length} debriefing{allDebriefs.length > 1 ? 's' : ''} · {byDept.length} departement{byDept.length > 1 ? 's' : ''}</p>
        </div>
      </div>

      {byDept.map(dept => (
        <div key={dept.id} className="global-debrief-dept-block">
          <div className="global-debrief-dept-label">
            <span>📁</span>{dept.name}
            <span className="badge badge-info" style={{ marginLeft: 'auto' }}>{dept.debriefs.length}</span>
          </div>
          {dept.debriefs.map(ev => {
            const concernedNames = resolveDeptNames(ev.departments);
            return (
              <div key={ev.id} className="debrief-card">
                <div className="debrief-card-header">
                  <div>
                    <div className="debrief-title">{ev.title}</div>
                    <div className="debrief-meta">{fmtDateTime(ev.date)}</div>
                  </div>
                  <span className="badge badge-muted">{fmtRelative(ev.createdAt)}</span>
                </div>

                {concernedNames.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.6px', marginRight: 2 }}>
                      Departements :
                    </span>
                    {concernedNames.map((name, i) => (
                      <span key={i} className="badge badge-info">{name}</span>
                    ))}
                  </div>
                )}

                {ev.desc && (
                  <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text)', marginBottom: (ev.remarks || []).length ? 14 : 0 }}>
                    {ev.desc}
                  </div>
                )}
                {(ev.remarks || []).length > 0 && (
                  <div className="remark-list" style={{ marginTop: 10 }}>
                    {ev.remarks.map(r => (
                      <div key={r.id} className="remark-item">
                        <div className="remark-text">💬 {r.text}</div>
                        <span className="remark-time">{fmtRelative(r.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

const TABS = [
  { key: 'procedure', label: 'Procedure' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'pending',   label: 'En cours'  },
  { key: 'debriefing',label: 'Debriefing'},
];
const TYPE_TO_TAB = { checklist: 'checklist', pending: 'pending', debriefing: 'debriefing' };

function App() {
  const [role, setRole]             = useState(null);
  const [departments, setDepts]     = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab]   = useState('procedure');
  const [menuOpen, setMenuOpen]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const [modal, setModal]           = useState(null);
  const addToast = useContext(ToastContext);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(user => {
      const newRole = user ? 'RESPONSABLE' : (localStorage.getItem('guestaccess') === 'EQUIPE' ? 'EQUIPE' : 'NONE');
      setRole(newRole);
      if (newRole === 'EQUIPE') setSelectedId(prev => prev || 'GLOBAL_DEBRIEF');
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!role || role === 'NONE') return;
    return db.collection('departments').orderBy('createdAt', 'asc')
      .onSnapshot(snap => setDepts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))), console.error);
  }, [role]);

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') { setModal(null); setMenuOpen(false); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const isAdmin = role === 'RESPONSABLE';

  const activeDepts = useMemo(() => departments.filter(d => !d.deletedAt), [departments]);
  const activeDept  = useMemo(() => activeDepts.find(d => d.id === selectedId), [activeDepts, selectedId]);

  const selectDept = useCallback((id, tab = 'procedure') => {
    setSelectedId(id);
    setActiveTab(tab);
    setMenuOpen(false);
  }, []);

  const addDept = () => {
    const name = window.prompt('Nom du departement');
    if (!name?.trim()) return;
    setSaving(true);
    db.collection('departments')
      .add({ name: name.trim(), procedure: '', checklist: [], pendingTasks: [], debriefings: [], createdAt: Date.now() })
      .then(ref => { setSaving(false); addToast('Departement cree', 'success'); selectDept(ref.id); })
      .catch(() => { setSaving(false); addToast('Erreur lors de la creation', 'error'); });
  };

  const archiveDept = (id, name, e) => {
    e.stopPropagation();
    setModal({
      open: true, title: 'Archiver le departement',
      message: `${name} sera deplace vers la corbeille. Vous pourrez le restaurer ulterieurement.`,
      danger: true,
      onConfirm: () => deptRef(id).update({ deletedAt: Date.now() }).then(() => {
        if (selectedId === id) setSelectedId(null);
        setModal(null);
        addToast('Departement archive', 'success');
      }),
      onCancel: () => setModal(null)
    });
  };

  const logout = () => setModal({
    open: true, title: 'Deconnexion', message: 'Etes-vous sur de vouloir vous deconnecter ?',
    onConfirm: () => auth.signOut().then(() => {
      localStorage.removeItem('guestaccess'); setRole('NONE'); setSelectedId(null); setModal(null);
    }),
    onCancel: () => setModal(null)
  });

  const handleSearchSelect = useCallback((deptId, type) => {
    selectDept(deptId, TYPE_TO_TAB[type] || 'procedure');
  }, [selectDept]);

  if (role === null) return (
    <div className="loader-screen">
      <div className="loader-logo">G-Dept <span>Pro</span></div>
      <div className="loader-dots"><span></span><span></span><span></span></div>
    </div>
  );

  if (role === 'NONE') return (
    <LoginScreen onGuest={() => {
      localStorage.setItem('guestaccess', 'EQUIPE');
      setRole('EQUIPE');
      setSelectedId('GLOBAL_DEBRIEF');
    }} />
  );

  const Header = ({ title, children }) => (
    <header className="main-header no-print">
      <div className="main-header-left"><h1 className="main-title">{title}</h1>{children}</div>
      <div className="main-header-right">
        <ConnectivityBadge />
        <SearchBar departments={departments} onSelect={handleSearchSelect} />
      </div>
    </header>
  );

  return (
    <div className="app">
      <button className="hamburger no-print" aria-label="Ouvrir le menu" onClick={() => setMenuOpen(true)}>☰</button>
      <div className={`overlay ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)} aria-hidden="true"></div>

      <aside className={`sidebar no-print ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <span>G-Dept <span style={{ color: 'var(--accent)' }}>Pro</span></span>
          <button className="btn-icon" style={{ color: '#fff' }} aria-label="Fermer le menu" onClick={() => setMenuOpen(false)}>✕</button>
        </div>
        <nav className="sidebar-nav">
          {isAdmin && (
            <button className="btn btn-ghost" style={{ width: '100%', marginBottom: 16, justifyContent: 'flex-start' }} onClick={addDept}>
              + Nouveau departement
            </button>
          )}
          {!isAdmin && (
            <div className={`dept-item ${selectedId === 'GLOBAL_DEBRIEF' ? 'active' : ''}`}
              onClick={() => setSelectedId('GLOBAL_DEBRIEF')} role="button" tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && setSelectedId('GLOBAL_DEBRIEF')}
              style={{ background: selectedId === 'GLOBAL_DEBRIEF' ? 'rgba(0,223,154,.22)' : undefined, marginBottom: 8 }}>
              <span className="dept-item-name">🗒️ &nbsp;Debriefings</span>
            </div>
          )}
          <div className={`dept-item ${selectedId === 'DASHBOARD' ? 'active' : ''}`}
            onClick={() => setSelectedId('DASHBOARD')} role="button" tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && setSelectedId('DASHBOARD')}>
            <span className="dept-item-name">Vue d'ensemble</span>
          </div>
          <div className="sidebar-divider"></div>
          {activeDepts.length === 0
            ? <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
                {isAdmin ? 'Creez votre premier departement' : 'Aucun departement disponible'}
              </div>
            : activeDepts.map(d => {
                const pendingCount = (d.pendingTasks || []).filter(t => t.status === 'pending').length;
                return (
                  <div key={d.id} className={`dept-item ${selectedId === d.id ? 'active' : ''}`}
                    onClick={() => selectDept(d.id)} role="button" tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && selectDept(d.id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                      <span className="dept-item-name">{d.name}</span>
                      {pendingCount > 0 && <span className="badge badge-danger" style={{ fontSize: 10, padding: '1px 6px' }} aria-hidden="true">{pendingCount}</span>}
                    </div>
                    {isAdmin && (
                      <button className="btn-icon" style={{ color: 'rgba(255,255,255,0.4)' }}
                        onClick={e => archiveDept(d.id, d.name, e)} aria-label={`Archiver ${d.name}`}>🗄️</button>
                    )}
                  </div>
                );
              })
          }
        </nav>
        <div className="sidebar-footer">
          <button className="btn" style={{ width: '100%', textAlign: 'left', background: 'transparent', color: 'rgba(255,255,255,0.65)', marginBottom: 8, justifyContent: 'flex-start' }}
            onClick={() => setSelectedId('TRASH')}>Corbeille</button>
          <button className="btn" style={{ width: '100%', textAlign: 'left', background: 'rgba(239,68,68,0.12)', color: '#FCA5A5', justifyContent: 'flex-start' }}
            onClick={logout}>Deconnexion</button>
        </div>
      </aside>

      <main className="main">
        {selectedId === 'GLOBAL_DEBRIEF' && (
          <>
            <Header title="Notes de debriefing" />
            <div className="main-body"><GlobalDebriefView departments={departments} /></div>
          </>
        )}
        {selectedId === 'DASHBOARD' && (
          <>
            <Header title="Vue d'ensemble" />
            <div className="main-body"><DashboardView departments={departments} /></div>
          </>
        )}
        {selectedId === 'TRASH' && (
          <>
            <Header title="Corbeille" />
            <div className="main-body"><TrashView departments={departments} isAdmin={isAdmin} addToast={addToast} /></div>
          </>
        )}
        {(!selectedId || (!activeDept && selectedId !== 'DASHBOARD' && selectedId !== 'TRASH' && selectedId !== 'GLOBAL_DEBRIEF')) && (
          <div className="empty-state" style={{ flex: 1 }}>
            <div className="empty-state-icon" style={{ fontSize: 52 }}>📂</div>
            <h2 className="empty-state-title" style={{ fontSize: 20 }}>Aucun departement selectionne</h2>
            <p className="empty-state-text">Selectionnez un departement dans le menu lateral pour consulter ses procedures et taches.</p>
          </div>
        )}
        {activeDept && (
          <>
            <Header title={activeDept.name}>
              {isAdmin && <span className="badge badge-success">Admin</span>}
              <SavingIndicator saving={saving} />
            </Header>
            <div className="main-header no-print" style={{ borderBottom: 'none', paddingTop: 0, paddingBottom: 12 }}>
              <nav className="tabs" aria-label="Onglets du departement">
                {TABS.map(({ key, label }) => (
                  <button key={key} className={`tab-btn ${activeTab === key ? 'active' : ''}`}
                    onClick={() => setActiveTab(key)} aria-selected={activeTab === key} role="tab">
                    {label}
                  </button>
                ))}
              </nav>
            </div>
            <div className="main-body" role="tabpanel">
              {activeTab === 'procedure'  && <ProcedureTab  dept={activeDept} isAdmin={isAdmin} setSaving={setSaving} addToast={addToast} />}
              {activeTab === 'checklist'  && <ChecklistTab  dept={activeDept} isAdmin={isAdmin} setSaving={setSaving} addToast={addToast} setModal={setModal} />}
              {activeTab === 'pending'    && <PendingTab    dept={activeDept} isAdmin={isAdmin} setSaving={setSaving} addToast={addToast} setModal={setModal} />}
              {activeTab === 'debriefing' && <DebriefingTab dept={activeDept} departments={departments} isAdmin={isAdmin} setSaving={setSaving} addToast={addToast} setModal={setModal} />}
            </div>
          </>
        )}
      </main>

      <ConfirmModal
        open={modal?.open || false}
        title={modal?.title}
        message={modal?.message}
        danger={modal?.danger || false}
        onConfirm={modal?.onConfirm || (() => setModal(null))}
        onCancel={modal?.onCancel  || (() => setModal(null))}
      />
    </div>
  );
}

export default function Root() { return <ToastProvider><App /></ToastProvider>; }
