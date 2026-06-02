import { useState, useEffect } from 'react';

const ERROR_MESSAGES: Record<string, string> = {
  revoked:         'このライセンスキーは無効化されています。',
  expired:         'ライセンスの有効期限が切れています。',
  device_mismatch: '別の端末で使用中のキーです。',
  not_found:       'ライセンスキーが見つかりません。',
  network_error:   'サーバーに接続できませんでした。',
  invalid_token:   'クライアントシークレットが正しくありません。',
};

export default function License() {
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
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="font-medium text-green-800">認証済み</span>
          </div>
          <p className="text-sm text-green-700 font-mono mb-4">{status.key}</p>
          <button
            onClick={handleClear}
            className="text-sm text-red-600 hover:text-red-800 font-medium"
          >
            登録を削除する
          </button>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <span className="text-gray-600">未登録</span>
          </div>
        </div>
      )}

      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ライセンスキー
          </label>
          <input
            type="text"
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="HANA-XXXX-XXXX-XXXX"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pink-400"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            クライアントシークレット
          </label>
          <input
            type="password"
            value={clientSecret}
            onChange={e => setClientSecret(e.target.value)}
            placeholder="管理者から発行されたシークレット"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pink-400"
            required
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {success && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
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
