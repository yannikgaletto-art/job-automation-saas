
export default function TermsOfServicePage() {
    return (
        <div className="max-w-4xl mx-auto p-8 font-sans text-[#37352F]">
            <h1 className="text-3xl font-bold mb-4">Terms of Service</h1>
            <p className="text-sm text-gray-600 mb-8">Version 1.0 | Last Updated: Feb 2026</p>

            <div className="space-y-6">
                <section>
                    <h2 className="text-xl font-semibold mb-2">1. Service Description</h2>
                    <p>Pathly is an automated job application assistant. We provide tools to help you manage and expedite your job search.</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-2">2. User Obligations</h2>
                    <p>You agree to provide accurate information and not to misuse the service for spamming or illegal activities.</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-2">3. Liability</h2>
                    <p>Pathly provides suggestions and automation but does not guarantee job offers. We are not liable for the outcome of your applications.</p>
                </section>
            </div>
        </div>
    )
}
