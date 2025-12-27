export default function ApplicationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <div className="min-h-screen bg-surface-50 p-8">
      <h1 className="text-2xl font-bold">Application {params.id}</h1>
      <p className="text-surface-600 mt-2">Application details coming soon.</p>
    </div>
  );
}
