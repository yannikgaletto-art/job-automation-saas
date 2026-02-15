"use client";

import { useState } from 'react';
import { Shield, Lock, Eye, Download } from 'lucide-react';
import { Badge } from '@/components/motion/badge';
import { Button } from '@/components/motion/button';

export default function SecurityPage() {
    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-semibold text-[#37352F] flex items-center gap-3">
                    <Shield className="w-8 h-8 text-[#0066FF]" />
                    Security & Privacy
                </h1>
                <p className="text-[#73726E] mt-1">DSGVO & NIS2 compliant data management</p>
            </div>

            {/* Compliance Status */}
            <div className="bg-white rounded-lg border border-[#E7E7E5] p-6">
                <h2 className="text-xl font-semibold text-[#37352F] mb-4">Compliance Status</h2>
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-[#37352F]">DSGVO (GDPR)</span>
                        <Badge variant="success">✓ Compliant</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[#37352F]">NIS2</span>
                        <Badge variant="success">✓ Compliant</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[#37352F]">Data Encryption</span>
                        <Badge variant="success">✓ Active</Badge>
                    </div>
                </div>
            </div>

            {/* Data Rights */}
            <div className="bg-white rounded-lg border border-[#E7E7E5] p-6">
                <h2 className="text-xl font-semibold text-[#37352F] mb-4">Your Data Rights</h2>
                <div className="space-y-4">
                    <div className="flex items-start gap-4">
                        <Eye className="w-5 h-5 text-[#0066FF] mt-1" />
                        <div className="flex-1">
                            <h3 className="font-medium text-[#37352F]">Right to Access</h3>
                            <p className="text-sm text-[#73726E] mt-1">View all your stored data</p>
                            <Button variant="outline" className="mt-2">
                                <Download className="w-4 h-4 mr-2" />
                                Export My Data
                            </Button>
                        </div>
                    </div>

                    <div className="flex items-start gap-4">
                        <Lock className="w-5 h-5 text-[#0066FF] mt-1" />
                        <div className="flex-1">
                            <h3 className="font-medium text-[#37352F]">Data Retention</h3>
                            <p className="text-sm text-[#73726E] mt-1">
                                Your data is automatically deleted 90 days after account closure.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Consent History */}
            <div className="bg-white rounded-lg border border-[#E7E7E5] p-6">
                <h2 className="text-xl font-semibold text-[#37352F] mb-4">Consent History</h2>
                <div className="space-y-2">
                    <div className="flex items-center justify-between py-2">
                        <span className="text-[#37352F]">Privacy Policy (v1.0)</span>
                        <span className="text-sm text-[#73726E]">Accepted</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                        <span className="text-[#37352F]">Terms of Service (v1.0)</span>
                        <span className="text-sm text-[#73726E]">Accepted</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                        <span className="text-[#37352F]">AI Processing</span>
                        <span className="text-sm text-[#73726E]">Accepted</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
