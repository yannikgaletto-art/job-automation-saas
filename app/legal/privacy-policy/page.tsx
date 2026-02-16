
export default function PrivacyPolicyPage() {
    return (
        <div className="max-w-4xl mx-auto p-8 font-sans text-[#37352F]">
            <h1 className="text-3xl font-bold mb-4">Privacy Policy</h1>
            <p className="text-sm text-gray-600 mb-8">Version 1.0 | Last Updated: Feb 2026</p>

            <div className="space-y-6">
                <section>
                    <h2 className="text-xl font-semibold mb-2">1. Data Collection</h2>
                    <p>We collect personal data (Name, Email, CVs) specifically for the purpose of generating job applications. Data is stored securely in Frankfurt (AWS/Supabase).</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-2">2. Data Usage</h2>
                    <p>Your data is used solely to functionality of Pathly. We do not sell your data to third parties.</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-2">3. Your Rights (DSGVO)</h2>
                    <p>You have the right to access, correct, and delete your data at any time. You can request deletion via your account settings.</p>
                </section>
            </div>
        </div>
    )
}
