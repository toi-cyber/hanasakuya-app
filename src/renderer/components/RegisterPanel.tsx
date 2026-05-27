import React, { useState } from 'react';

const API_URL = 'https://application.hanasakuya.ai/user/api/l2026-06/users.json';
const ACCESS_TOKEN = 'o4m9xhoyzw';

type RegisterState = 'idle' | 'submitting' | 'success' | 'error';

interface RegisterPanelProps {
  dark: boolean;
}

export default function RegisterPanel({ dark }: RegisterPanelProps) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<RegisterState>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setState('submitting');
    setMessage('');

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hanasakuya-Access-Token': ACCESS_TOKEN,
        },
        body: JSON.stringify({
          user: {
            mail: email.trim(),
            request_type: 'register',
            status: 'new',
          },
        }),
      });

      if (res.status === 200) {
        setState('success');
        setMessage('アカウントが登録ができました');
      } else if (res.status === 500) {
        setState('error');
        setMessage('時間をおいて再度操作してください');
      } else {
        setState('error');
        setMessage('エラーが発生しました。support@hanasakuya.ai こちらに問い合わせてください');
      }
    } catch {
      setState('error');
      setMessage('エラーが発生しました。support@hanasakuya.ai こちらに問い合わせてください');
    }
  };

  const handleReset = () => {
    setState('idle');
    setMessage('');
    setEmail('');
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className={`w-full max-w-sm rounded-xl p-6 ${dark ? 'bg-[#242424]' : 'bg-white'} shadow-lg`}>
        <h2 className={`text-lg font-bold mb-6 ${dark ? 'text-white' : 'text-gray-800'}`}>
          アカウント登録
        </h2>

        {state === 'success' ? (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className={`text-sm ${dark ? 'text-green-400' : 'text-green-600'}`}>{message}</p>
            <button
              onClick={handleReset}
              className={`text-xs ${dark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'} transition-colors`}
            >
              別のアカウントを登録
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={`block text-xs mb-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                メールアドレス
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                disabled={state === 'submitting'}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                style={{
                  border: `1px solid ${dark ? '#3a3a3a' : '#e5e7eb'}`,
                  background: dark ? '#2a2a2a' : '#f9fafb',
                  color: dark ? '#e5e7eb' : '#374151',
                }}
              />
            </div>

            {message && state === 'error' && (
              <p className="text-xs text-red-400">{message}</p>
            )}

            <button
              type="submit"
              disabled={state === 'submitting' || !email.trim()}
              className="w-full py-2.5 rounded-lg text-sm font-medium transition-colors bg-sakura-500 hover:bg-sakura-600 disabled:opacity-60 disabled:cursor-not-allowed text-white"
            >
              {state === 'submitting' ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  登録中...
                </span>
              ) : (
                '登録'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
