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