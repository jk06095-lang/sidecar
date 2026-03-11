import React, { useState, useEffect } from 'react';
import {
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged,
    signOut,
    type User,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Anchor, Loader2 } from 'lucide-react';

interface AuthGateProps {
    children: React.ReactNode;
}

const googleProvider = new GoogleAuthProvider();

export default function AuthGate({ children }: AuthGateProps) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [signingIn, setSigningIn] = useState(false);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => {
            setUser(u);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const handleGoogleLogin = async () => {
        setError('');
        setSigningIn(true);
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (err: any) {
            console.error('Google sign-in error:', err);
            if (err.code === 'auth/popup-closed-by-user') {
                setError('로그인 팝업이 닫혔습니다. 다시 시도해주세요.');
            } else if (err.code === 'auth/unauthorized-domain') {
                setError('이 도메인은 Firebase에서 승인되지 않았습니다. Firebase Console → Authentication → Settings에서 도메인을 추가하세요.');
            } else {
                setError(`로그인 오류: ${err.message}`);
            }
        } finally {
            setSigningIn(false);
        }
    };

    // Loading spinner
    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center animate-pulse">
                        <Anchor size={24} className="text-white" />
                    </div>
                    <div className="text-slate-400 text-sm">Loading SIDECAR...</div>
                </div>
            </div>
        );
    }

    // Authenticated → render app
    if (user) {
        return <>{children}</>;
    }

    // Login screen
    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-2xl shadow-cyan-500/30 mx-auto mb-4">
                        <Anchor size={32} className="text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white tracking-wide">SIDECAR</h1>
                    <p className="text-slate-500 text-sm mt-1">Maritime Command — AIP Platform</p>
                </div>

                {/* Card */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-8 shadow-xl backdrop-blur-xl">
                    <div className="text-center mb-6">
                        <h2 className="text-white font-semibold text-lg mb-1">로그인</h2>
                        <p className="text-slate-500 text-xs">Google 계정으로 SIDECAR에 접속합니다</p>
                    </div>

                    {error && (
                        <div className="text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 mb-4">
                            {error}
                        </div>
                    )}

                    <button
                        onClick={handleGoogleLogin}
                        disabled={signingIn}
                        className="w-full bg-white text-slate-800 font-medium py-3 rounded-lg hover:bg-slate-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg"
                    >
                        {signingIn ? (
                            <Loader2 size={20} className="animate-spin text-slate-500" />
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                        )}
                        <span>{signingIn ? '로그인 중...' : 'Google 계정으로 로그인'}</span>
                    </button>
                </div>

                <p className="text-center text-slate-600 text-[10px] mt-6">
                    © 2026 SIDECAR AIP Platform. Secure maritime intelligence.
                </p>
            </div>
        </div>
    );
}

export const useAuthUser = () => {
    const [user, setUser] = useState<User | null>(null);
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, setUser);
        return () => unsub();
    }, []);
    return user;
};

export const logout = () => signOut(auth);
