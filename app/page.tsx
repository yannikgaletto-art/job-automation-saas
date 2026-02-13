export default function Home() {
    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            <div className="container mx-auto px-4 py-16">
                {/* Hero Section */}
                <div className="text-center mb-16">
                    <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent mb-6">
                        🚀 Pathly V2.0
                    </h1>
                    <p className="text-xl text-slate-300 mb-8">
                        Intelligent Job Application SaaS
                    </p>
                    <p className="text-slate-400 max-w-2xl mx-auto">
                        DSGVO & NIS2 Compliant | AI-Powered | Chrome Extension Hybrid
                    </p>
                </div>

                {/* Status Card */}
                <div className="max-w-xl mx-auto bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-700">
                    <h2 className="text-2xl font-semibold text-white mb-6">
                        ✅ Setup Complete
                    </h2>

                    <div className="space-y-4 text-slate-300">
                        <div className="flex items-center gap-3">
                            <span className="text-green-500">✓</span>
                            <span>Next.js 15 + React 19</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-green-500">✓</span>
                            <span>Tailwind CSS v4</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-green-500">✓</span>
                            <span>TypeScript Configured</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-yellow-500">⚠</span>
                            <span>API Keys: Pending (.env.local)</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-yellow-500">⚠</span>
                            <span>Supabase: Needs Configuration</span>
                        </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-slate-600">
                        <h3 className="text-lg font-medium text-white mb-4">📚 Next Steps</h3>
                        <ol className="list-decimal list-inside space-y-2 text-slate-400">
                            <li>Add API keys to <code className="bg-slate-700 px-2 py-1 rounded text-sm">.env.local</code></li>
                            <li>Configure Supabase project</li>
                            <li>Load database schema</li>
                            <li>Read <code className="bg-slate-700 px-2 py-1 rounded text-sm">docs/ARCHITECTURE.md</code></li>
                        </ol>
                    </div>
                </div>

                {/* Footer */}
                <div className="text-center mt-16 text-slate-500">
                    <p>Made with ❤️ in Berlin | Version 2.0.0</p>
                </div>
            </div>
        </main>
    );
}
