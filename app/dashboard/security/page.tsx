"use client";

import { Shield, Lock, Eye, Download, FileText, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/motion/badge';
import { Button } from '@/components/motion/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SecurityPage() {
  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold text-[#37352F] flex items-center gap-3">
          <Shield className="w-8 h-8 text-[#0066FF]" />
          Security & Privacy
        </h1>
        <p className="text-[#73726E] mt-1">DSGVO & NIS2 compliant data management. Your privacy is our top priority.</p>
      </div>

      {/* Compliance Status Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* DSGVO Compliance */}
        <div className="bg-white rounded-lg border border-[#E7E7E5] p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-[#37352F]" />
              <h2 className="text-xl font-semibold text-[#37352F]">DSGVO Compliance</h2>
            </div>
            <Badge variant="success">✓ Compliant</Badge>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-[#37352F]">Data Encryption at Rest</div>
                <div className="text-sm text-[#73726E]">All data encrypted using AES-256</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-[#37352F]">PII Pseudonymization</div>
                <div className="text-sm text-[#73726E]">Personal data is separated and secured</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-[#37352F]">Right to Deletion</div>
                <div className="text-sm text-[#73726E]">Request full data wipe anytime</div>
              </div>
            </div>
          </div>
        </div>

        {/* NIS2 Directive */}
        <div className="bg-white rounded-lg border border-[#E7E7E5] p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[#37352F]" />
              <h2 className="text-xl font-semibold text-[#37352F]">NIS2 Directive</h2>
            </div>
            <Badge variant="success">✓ Compliant</Badge>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-[#37352F]">Incident Reporting</div>
                <div className="text-sm text-[#73726E]">Security incidents reported within 24h</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-[#37352F]">Audit Trails</div>
                <div className="text-sm text-[#73726E]">All security actions are logged</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-[#37352F]">Supply Chain Security</div>
                <div className="text-sm text-[#73726E]">Regular 3rd-party vendor assessments</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Data Rights & Consent */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Your Data Rights */}
        <div className="bg-white rounded-lg border border-[#E7E7E5] p-6 flex flex-col">
          <h2 className="text-xl font-semibold text-[#37352F] mb-4">Your Data Rights</h2>
          <div className="space-y-3 flex-1">
            <Button variant="outline" className="w-full justify-start h-auto py-3">
              <FileText className="h-4 w-4 mr-2" />
              <div className="text-left">
                <span className="block font-medium">View Privacy Policy</span>
                <span className="text-xs text-[#73726E]">Read full terms (v1.0)</span>
              </div>
            </Button>
            <Button variant="outline" className="w-full justify-start h-auto py-3">
              <Download className="h-4 w-4 mr-2" />
              <div className="text-left">
                <span className="block font-medium">Export My Data</span>
                <span className="text-xs text-[#73726E]">Download all stored information</span>
              </div>
            </Button>
            <Button variant="outline" className="w-full justify-start h-auto py-3 text-red-600 hover:text-red-700 hover:bg-red-50">
              <Trash2 className="h-4 w-4 mr-2" />
              <div className="text-left">
                <span className="block font-medium">Delete Account</span>
                <span className="text-xs opacity-80">Permanent removal of all data</span>
              </div>
            </Button>
          </div>
        </div>

        {/* Consent History */}
        <div className="bg-white rounded-lg border border-[#E7E7E5] p-6">
          <h2 className="text-xl font-semibold text-[#37352F] mb-4">Consent History</h2>
          <div className="space-y-0 divide-y divide-[#E7E7E5]">
            <div className="flex items-center justify-between py-3">
              <div>
                <span className="block text-[#37352F] font-medium">Privacy Policy</span>
                <span className="text-xs text-[#73726E]">Version 1.0</span>
              </div>
              <span className="text-sm text-green-600 bg-green-50 px-2 py-1 rounded">Accepted</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <span className="block text-[#37352F] font-medium">Terms of Service</span>
                <span className="text-xs text-[#73726E]">Version 1.0</span>
              </div>
              <span className="text-sm text-green-600 bg-green-50 px-2 py-1 rounded">Accepted</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <span className="block text-[#37352F] font-medium">AI Processing Processing</span>
                <span className="text-xs text-[#73726E]">Clause 4.2</span>
              </div>
              <span className="text-sm text-green-600 bg-green-50 px-2 py-1 rounded">Accepted</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <span className="block text-[#37352F] font-medium">Cookie Consent</span>
                <span className="text-xs text-[#73726E]">Essential only</span>
              </div>
              <span className="text-sm text-green-600 bg-green-50 px-2 py-1 rounded">Accepted</span>
            </div>
          </div>
        </div>
      </div>

      <div className="text-center text-sm text-[#73726E] pt-4">
        Questions about data security? Contact our Data Protection Officer at{' '}
        <a href="mailto:dpo@job-automation-saas.com" className="text-[#0066FF] hover:underline">
          dpo@job-automation-saas.com
        </a>
      </div>
    </div>
  );
}
