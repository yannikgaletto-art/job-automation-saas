<<<<<<< HEAD
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
=======
'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Shield, Lock, FileText, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react'

export default function SecurityPage() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Shield className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Data Security & Compliance</h1>
          </div>
          <p className="text-muted-foreground">
            Your data privacy and security is our top priority. We comply with DSGVO and NIS2 regulations.
          </p>
        </div>

        {/* DSGVO Compliance */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  DSGVO Compliance
                </CardTitle>
                <CardDescription>
                  General Data Protection Regulation (EU)
                </CardDescription>
              </div>
              <Badge variant="success" className="bg-green-100 text-green-800 border-green-200">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Compliant
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Data Encryption at Rest</div>
                <div className="text-sm text-muted-foreground">
                  All data is encrypted using AES-256 encryption
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">PII Pseudonymization</div>
                <div className="text-sm text-muted-foreground">
                  Personal identifiable information is pseudonymized
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Right to Deletion</div>
                <div className="text-sm text-muted-foreground">
                  You can request deletion of your data at any time
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Data Processing Agreement</div>
                <div className="text-sm text-muted-foreground">
                  Available for review and download
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* NIS2 Directive */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  NIS2 Directive
                </CardTitle>
                <CardDescription>
                  Network and Information Security Directive (EU)
                </CardDescription>
              </div>
              <Badge variant="success" className="bg-green-100 text-green-800 border-green-200">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Compliant
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Incident Reporting</div>
                <div className="text-sm text-muted-foreground">
                  Security incidents reported within 24 hours
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Security Measures Documentation</div>
                <div className="text-sm text-muted-foreground">
                  All security measures are documented and auditable
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Supply Chain Risk Assessment</div>
                <div className="text-sm text-muted-foreground">
                  Regular assessment of third-party service providers
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Your Data Rights</CardTitle>
            <CardDescription>
              Manage your data and privacy settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start">
              <FileText className="h-4 w-4 mr-2" />
              View Privacy Policy
            </Button>
            <Button variant="outline" className="w-full justify-start">
              <FileText className="h-4 w-4 mr-2" />
              Download Data Processing Agreement
            </Button>
            <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Request Data Deletion
            </Button>
          </CardContent>
        </Card>

        {/* Contact */}
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground text-center">
              Questions about data security? Contact our Data Protection Officer at{' '}
              <a href="mailto:dpo@job-automation-saas.com" className="text-primary hover:underline">
                dpo@job-automation-saas.com
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
>>>>>>> f23849bea9b2b6e55c04635c07d74784a1ebff92
