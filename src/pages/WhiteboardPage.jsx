import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { loadElements, clearBoard } from '../store/boardSlice';
import { useSocket } from '../context/SocketContext';
import Toolbar from '../components/Toolbar';
import Canvas from '../components/Canvas';
import WaitingRoom from '../components/WaitingRoom';
import ApprovalToast from '../components/ApprovalToast';
import LoginModal from '../components/LoginModal';

// ─── Save indicator states ────────────────────────────────────────────────────
const SAVE_STATES = { idle: 'idle', unsaved: 'unsaved', saving: 'saving', saved: 'saved' };

// ─── Debounce utility ─────────────────────────────────────────────────────────
function useDebounce(callback, delay) {
  const timerRef = useRef(null);
  return useCallback((...args) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => callback(...args), delay);
  }, [callback, delay]);
}

export default function WhiteboardPage() {
  const { id: boardId } = useParams();
  const dispatch   = useDispatch();
  const navigate   = useNavigate();
  const socketRef  = useSocket();

  const { elements } = useSelector(s => s.board);
  const { user }     = useSelector(s => s.auth);

  // Board meta
  const [boardTitle, setBoardTitle] = useState('Untitled Board');
  const [ownerName, setOwnerName]   = useState('');
  const isOwnerRef = useRef(false);

  // Access control state
  const [accessState, setAccessState] = useState('loading'); // 'loading' | 'granted' | 'pending' | 'denied'

  // Save indicator
  const [saveState, setSaveState] = useState(SAVE_STATES.idle);
  const isFirstLoad = useRef(true);

  // Login modal (triggered by Share / Download for guests)
  const [loginModal, setLoginModal] = useState(null); // null | 'share' | 'download'

  // ─── Load board ─────────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadBoard() {
      try {
        const { data } = await axios.get(`/api/boards/${boardId}`, { withCredentials: true });
        dispatch(loadElements(data.elements));
        setBoardTitle(data.title);
        isOwnerRef.current = data.ownerId === user?.id || data.ownerId?.toString() === user?.id;
        setAccessState('granted');

        // Join socket room
        const socket = socketRef?.current;
        if (socket) socket.emit('join-board', { boardId });
      } catch (err) {
        if (err.response?.status === 403) {
          setAccessState('pending');
          // Try to get owner info from response
          if (err.response.data?.ownerName) setOwnerName(err.response.data.ownerName);
        } else {
          navigate('/dashboard');
        }
      }
    }

    if (user) {
      loadBoard();
    } else {
      // Not authenticated — redirect to landing so they can sign in
      navigate('/', { replace: true });
    }
    return () => { dispatch(clearBoard()); };
  }, [boardId, user, dispatch, navigate, socketRef]);

  // ─── Auto-save (debounced, Phase 6) ─────────────────────────────────────────
  const doSave = useCallback(async (els) => {
    setSaveState(SAVE_STATES.saving);
    try {
      await axios.patch(`/api/boards/${boardId}/save`, { elements: els }, { withCredentials: true });
      setSaveState(SAVE_STATES.saved);
      setTimeout(() => setSaveState(SAVE_STATES.idle), 3000);
    } catch {
      setSaveState(SAVE_STATES.unsaved);
    }
  }, [boardId]);

  const debouncedSave = useDebounce(doSave, 2000);

  useEffect(() => {
    if (isFirstLoad.current) { isFirstLoad.current = false; return; }
    if (accessState !== 'granted') return;
    setSaveState(SAVE_STATES.unsaved);
    debouncedSave(elements);
  }, [elements, accessState, debouncedSave]);

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        dispatch({ type: 'board/undo' });
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        dispatch({ type: 'board/redo' });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch]);

  // ─── Access granted callback (from WaitingRoom) ──────────────────────────────
  const handleAccessGranted = useCallback(({ boardElements, boardTitle: title }) => {
    dispatch(loadElements(boardElements));
    if (title) setBoardTitle(title);
    setAccessState('granted');
    const socket = socketRef?.current;
    if (socket) socket.emit('join-board', { boardId });
  }, [dispatch, socketRef, boardId]);

  const handleAccessDenied = useCallback(() => {
    setAccessState('denied');
  }, []);

  // ─── Save indicator label ────────────────────────────────────────────────────
  const saveLabel = {
    [SAVE_STATES.idle]:    '',
    [SAVE_STATES.unsaved]: '✎ Unsaved changes',
    [SAVE_STATES.saving]:  '⟳ Saving...',
    [SAVE_STATES.saved]:   '✓ Saved to cloud',
  }[saveState];

  // ─── Render ──────────────────────────────────────────────────────────────────
  if (accessState === 'loading') {
    return (
      <div className="wb-loading">
        <div className="wb-loading-spinner" />
        <span>Loading board…</span>
      </div>
    );
  }

  if (accessState === 'pending') {
    return (
      <WaitingRoom
        boardId={boardId}
        ownerName={ownerName}
        onAccessGranted={handleAccessGranted}
        onAccessDenied={handleAccessDenied}
      />
    );
  }

  return (
    <div className="whiteboard-root">
      {/* Toolbar sidebar */}
      <Toolbar />

      {/* Top bar — sits above canvas area */}
      <div className="wb-main">
        <div className="wb-topbar">
        <button id="wb-back-btn" className="btn-ghost wb-back" onClick={() => navigate('/dashboard')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>

        <h2 className="wb-title">{boardTitle}</h2>

        <div className="wb-topbar-right">
          {/* Save indicator */}
          {saveLabel && (
            <span className={`save-indicator save-${saveState}`}>{saveLabel}</span>
          )}

          {/* Download button */}
          <button
            id="download-btn"
            className="btn-ghost"
            title="Download as PNG"
            onClick={() => {
              if (!user) { setLoginModal('download'); return; }
              const canvas = document.getElementById('main-canvas');
              if (!canvas) return;
              const link = document.createElement('a');
              link.download = `${boardTitle}.png`;
              link.href = canvas.toDataURL('image/png');
              link.click();
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export
          </button>

          {/* Share button */}
          <button
            id="share-link-btn"
            className="btn-ghost"
            title={user ? 'Copy share link' : 'Sign in to share'}
            onClick={() => {
              if (!user) { setLoginModal('share'); return; }
              navigator.clipboard.writeText(window.location.href);
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Share
          </button>

          {/* User avatar */}
          {user?.avatar && (
            <img src={user.avatar} alt={user.name} className="user-avatar" referrerPolicy="no-referrer" />
          )}
        </div>
      </div>

        {/* Canvas */}
        <Canvas boardId={boardId} />

        {/* Host approval toasts (visible only to owner) */}
        {isOwnerRef.current && <ApprovalToast boardId={boardId} />}

        {/* Login modal — triggered by Share / Download for guests */}
        {loginModal && (
          <LoginModal
            trigger={loginModal}
            onClose={() => setLoginModal(null)}
          />
        )}
      </div>
    </div>
  );
}
