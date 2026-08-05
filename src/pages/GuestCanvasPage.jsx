import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { clearBoard } from '../store/boardSlice';
import Toolbar from '../components/Toolbar';
import Canvas from '../components/Canvas';
import LoginModal from '../components/LoginModal';

/**
 * GuestCanvasPage — fully functional whiteboard with no authentication required.
 * Login modal is triggered only when the user clicks Share or Download.
 */
export default function GuestCanvasPage() {
  const dispatch  = useDispatch();
  const navigate  = useNavigate();
  const { user, isAuthenticated } = useSelector(s => s.auth);

  const [loginModal, setLoginModal] = useState(null); // null | 'share' | 'download'

  // Clean up Redux board state on unmount
  useEffect(() => {
    return () => { dispatch(clearBoard()); };
  }, [dispatch]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault(); dispatch({ type: 'board/undo' });
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault(); dispatch({ type: 'board/redo' });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch]);

  // ─── Share handler ────────────────────────────────────────────────────────────
  const handleShare = () => {
    if (!isAuthenticated) {
      // Guest — show login prompt
      setLoginModal('share');
    } else {
      // Logged-in user — copy link directly
      navigator.clipboard.writeText(window.location.href);
    }
  };

  // ─── Download handler ─────────────────────────────────────────────────────────
  const handleDownload = () => {
    if (!isAuthenticated) {
      // Guest — show login prompt
      setLoginModal('download');
    } else {
      // Logged-in user — export canvas as PNG
      const canvas = document.getElementById('main-canvas');
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = 'sketchsync-board.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  };

  return (
    <div className="whiteboard-root">
      {/* Sidebar toolbar */}
      <Toolbar />

      <div className="wb-main">
        {/* Top bar */}
        <div className="wb-topbar">
        {/* Logo / back to landing */}
        <button id="wb-home-btn" className="btn-ghost wb-back" onClick={() => navigate('/')}>
          <svg width="22" height="22" viewBox="0 0 44 44" fill="none">
            <rect width="44" height="44" rx="10" fill="url(#tbLogoGrad)" />
            <path d="M12 32 L22 12 L32 32" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M15.5 26 H28.5" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <defs>
              <linearGradient id="tbLogoGrad" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
                <stop stopColor="#7C3AED"/><stop offset="1" stopColor="#4F46E5"/>
              </linearGradient>
            </defs>
          </svg>
        </button>

        <h2 className="wb-title">SketchSync</h2>

        <div className="wb-topbar-right">
          {/* Download button */}
          <button
            id="download-btn"
            className="btn-ghost"
            title={isAuthenticated ? 'Download as PNG' : 'Sign in to download'}
            onClick={handleDownload}
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
            id="share-btn"
            className="btn-ghost"
            title={isAuthenticated ? 'Copy share link' : 'Sign in to share'}
            onClick={handleShare}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Share
          </button>

          {/* Auth area — subtle sign-in link for guests, avatar for logged-in */}
          {isAuthenticated ? (
            <button id="go-dashboard-btn" className="btn-primary btn-sm" onClick={() => navigate('/dashboard')}>
              My Boards
            </button>
          ) : (
            <button
              id="topbar-signin-btn"
              className="btn-signin-pill"
              onClick={() => setLoginModal('share')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/>
                <line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
              Sign in
            </button>
          )}

          {/* User avatar */}
          {user?.avatar && (
            <img src={user.avatar} alt={user.name} className="user-avatar" referrerPolicy="no-referrer" />
          )}
        </div>
      </div>

        {/* Canvas — no boardId means guest/local mode */}
        <Canvas boardId={null} />

        {/* Login modal — only appears when Share/Download clicked by guest */}
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
