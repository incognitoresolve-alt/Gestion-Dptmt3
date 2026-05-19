import React, { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } from 'react';
import { auth, db } from './firebase';

const ToastContext = createContext(() => {});
let _idCounter = 0;
const uid = () => `${Date.now()}_${++_idCounter}`;
const deptRef = (id) => db.collection('departments').doc(id);

// --- COLLE ICI TES COMPOSANTS (ProcedureTab, ChecklistTab, etc.) ---
// --- COLLE ENSUITE TA FONCTION App() ---

export default App;