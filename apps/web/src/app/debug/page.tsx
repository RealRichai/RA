export const dynamic = 'force-dynamic';

async function checkApiHealth() {
  const url = `${process.env.NEXT_PUBLIC_API_URL}/health`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return { connected: false, error: `HTTP ${res.status}`, url };
    }
    const data = await res.json();
    return { connected: true, data, url };
  } catch (err) {
    return { connected: false, error: String(err), url };
  }
}

export default async function DebugPage() {
  const result = await checkApiHealth();

  return (
    <div className="min-h-screen p-8 font-mono">
      <h1 className="text-2xl font-bold mb-6">Debug</h1>

      <div className="space-y-4">
        <div>
          <span className="text-gray-500">API URL:</span>{' '}
          <code className="bg-gray-100 px-2 py-1 rounded">{result.url}</code>
        </div>

        {result.connected ? (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-800 font-semibold">API Connected</p>
            <pre className="mt-2 text-sm text-green-700">
              {JSON.stringify(result.data, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 font-semibold">API Not Connected</p>
            <pre className="mt-2 text-sm text-red-700">{result.error}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
