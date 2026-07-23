import { useState, useEffect } from 'react';

const ERROR_MESSAGES: Record<string, string> = {
  revoked:         'このライセンスキーは無効化されています。',
  expired:         'ライセンスの有効期限が切れています。',
  device_mismatch: '別の端末で使用中のキーです。',
  not_found:       'ライセンスキーが見つかりません。',
  network_error:   'サーバーに接続できませんでした。',
  invalid_token:   'クライアントシークレットが正しくありません。',
};

export default function License({ dark }: { dark: boolean }) {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [key, setKey] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    window.license.getStatus().then(setStatus);
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const result = await window.license.register(key, clientSecret);

    if (result.valid) {
      setSuccess(true);
      setKey('');
      setClientSecret('');
      const updated = await window.license.getStatus();
      setStatus(updated);
    } else {
      setError(ERROR_MESSAGES[result.reason ?? ''] ?? '認証に失敗しました。');
    }
    setLoading(false);
  };

  const handleClear = async () => {
    if (!confirm('ライセンス登録を削除しますか？')) return;
    await window.license.clear();
    setStatus({ registered: false, key: null });
    setSuccess(false);
  };

  if (!status) return null;

  return (
    <div className="space-y-6">
      {status.registered ? (
        <div className={`${dark ? 'bg-green-900/30 border-green-800' : 'bg-green-50 border-green-200'} border rounded-xl p-5`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-8 h-8 ${dark ? 'bg-green-900/50' : 'bg-green-100'} rounded-full flex items-center justify-center`}>
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className={`font-medium ${dark ? 'text-green-400' : 'text-green-800'}`}>認証済み</span>
          </div>
          <p className={`text-sm font-mono mb-4 ${dark ? 'text-green-300' : 'text-green-700'}`}>{status.key}</p>
          <button
            onClick={handleClear}
            className={`text-sm font-medium ${dark ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-800'}`}
          >
            登録を削除する
          </button>
        </div>
      ) : (
        <div className={`${dark ? 'bg-[#2a2a2a] border-[#3a3a3a]' : 'bg-gray-50 border-gray-200'} border rounded-xl p-5`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 ${dark ? 'bg-[#333]' : 'bg-gray-200'} rounded-full flex items-center justify-center`}>
              <svg className={`w-4 h-4 ${dark ? 'text-gray-400' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <span className={dark ? 'text-gray-400' : 'text-gray-600'}>未登録</span>
          </div>
        </div>
      )}

      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label className={`block text-sm font-medium mb-1 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
            ライセンスキー
          </label>
          <input
            type="text"
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="HANA-XXXX-XXXX-XXXX"
            className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pink-400 ${
              dark ? 'bg-[#1a1a1a] border-[#3a3a3a] text-gray-200 placeholder-gray-600' : 'border-gray-300 text-gray-900 placeholder-gray-400'
            }`}
            required
          />
        </div>

        <div>
          <label className={`block text-sm font-medium mb-1 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
            クライアントシークレット
          </label>
          <input
            type="password"
            value={clientSecret}
            onChange={e => setClientSecret(e.target.value)}
            placeholder="管理者から発行されたシークレット"
            className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pink-400 ${
              dark ? 'bg-[#1a1a1a] border-[#3a3a3a] text-gray-200 placeholder-gray-600' : 'border-gray-300 text-gray-900 placeholder-gray-400'
            }`}
            required
          />
        </div>

        {error && (
          <p className={`text-sm rounded-lg px-3 py-2 border ${
            dark ? 'text-red-400 bg-red-900/30 border-red-800' : 'text-red-600 bg-red-50 border-red-200'
          }`}>
            {error}
          </p>
        )}

        {success && (
          <p className={`text-sm rounded-lg px-3 py-2 border ${
            dark ? 'text-green-400 bg-green-900/30 border-green-800' : 'text-green-700 bg-green-50 border-green-200'
          }`}>
            ライセンスを認証しました。
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-sakura-500 hover:bg-sakura-600 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {loading ? '認証中...' : '認証する'}
        </button>
      </form>
    </div>
  );
}
