
export default function CookiePolicyPage() {
    return (
        <div className="max-w-4xl mx-auto p-8 font-sans text-[#37352F]">
            <h1 className="text-3xl font-bold mb-4">Cookie Policy</h1>
            <p className="text-sm text-gray-600 mb-8">Version 1.0 | Last Updated: Feb 2026</p>

            <div className="space-y-6">
                <section>
                    <h2 className="text-xl font-semibold mb-2">1. Essential Cookies</h2>
                    <p>We use only essential cookies required for authentication and security (Supabase Auth). These cannot be disabled.</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-2">2. Analytics</h2>
                    <p>For this version of Pathly, we do <strong>not</strong> use third-party tracking cookies (like Google Analytics).</p>
                </section>
            </div>
        </div>
    )
}
