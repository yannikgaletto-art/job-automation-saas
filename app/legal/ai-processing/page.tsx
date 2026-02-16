
export default function AIProcessingPage() {
    return (
        <div className="max-w-4xl mx-auto p-8 font-sans text-[#37352F]">
            <h1 className="text-3xl font-bold mb-4">AI Processing Policy</h1>
            <p className="text-sm text-gray-600 mb-8">Version 1.0 | Last Updated: Feb 2026</p>

            <div className="space-y-6">
                <section>
                    <h2 className="text-xl font-semibold mb-2">1. AI Models</h2>
                    <p>We use Anthropic's Claude models to analyze your CV and generate cover letters. This processing is essential for the core functionality of Pathly.</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-2">2. Data Sharing</h2>
                    <p>Text data from your CV and job descriptions is sent to the Anthropic API for processing. Anthropic does not train their models on your data (Enterprise/API agreement).</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-2">3. Automated Decision Making</h2>
                    <p>The AI provides <strong>suggestions</strong> only. You always have the final review before any application is sent.</p>
                </section>
            </div>
        </div>
    )
}
