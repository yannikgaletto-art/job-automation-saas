"use client";

import React from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { Eye, Edit, X, MapPin, DollarSign, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Badge } from './badge';

// ============================================================================
// JOB CARD COMPONENT - Tinder-Style with AI Insights
// ============================================================================

interface JobCardProps {
  company: string;
  logo?: string;
  jobTitle: string;
  location: string;
  salary: string;
  remote?: string;
  matchScore: number;
  aiInsight?: string;
  skills: string[];
  onReview: () => void;
  onEdit: () => void;
  onSkip: () => void;
  className?: string;
}

export function JobCard({
  company,
  logo,
  jobTitle,
  location,
  salary,
  remote,
  matchScore,
  aiInsight,
  skills,
  onReview,
  onEdit,
  onSkip,
  className,
}: JobCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-10, 10]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0.5, 1, 1, 1, 0.5]);

  // Determine match score gradient
  const getMatchGradient = (score: number) => {
    if (score >= 90) return 'from-[#00C853] to-[#0066FF]'; // High
    if (score >= 70) return 'from-[#FFA000] to-[#FF6D00]'; // Mid
    return 'from-[#D32F2F] to-[#C62828]'; // Low
  };

  const handleDragEnd = (_: any, info: any) => {
    if (info.offset.x > 100) {
      onReview();
    } else if (info.offset.x < -100) {
      onSkip();
    }
  };

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={handleDragEnd}
      style={{ x, rotate, opacity }}
      whileHover={{ scale: 1.02, y: -2 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "w-full max-w-2xl bg-white rounded-xl border border-[#E7E7E5]",
        "shadow-sm hover:shadow-md transition-shadow",
        "p-6 space-y-4 cursor-grab active:cursor-grabbing",
        className
      )}
    >
      {/* Header: Company + Match Score */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {logo ? (
            <img src={logo} alt={company} className="w-12 h-12 rounded-lg object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-[#F7F7F5] flex items-center justify-center">
              <Briefcase className="w-6 h-6 text-[#73726E]" />
            </div>
          )}
          <div>
            <h3 className="text-lg font-semibold text-[#37352F]">{company}</h3>
            <p className="text-sm text-[#73726E]">{jobTitle}</p>
          </div>
        </div>

        {/* Match Score Badge */}
        <div
          className={cn(
            "px-3 py-1 rounded-full bg-gradient-to-r text-white font-semibold text-sm flex items-center gap-1",
            getMatchGradient(matchScore)
          )}
        >
          ⭐ {matchScore}%
        </div>
      </div>

      {/* Job Details */}
      <div className="flex items-center gap-4 text-sm text-[#73726E]">
        <div className="flex items-center gap-1">
          <MapPin className="w-4 h-4" />
          {location}
        </div>
        <div className="flex items-center gap-1">
          <DollarSign className="w-4 h-4" />
          {salary}
        </div>
        {remote && (
          <Badge variant="secondary" className="ml-auto">
            {remote}
          </Badge>
        )}
      </div>

      {/* AI Insight */}
      {aiInsight && (
        <div className="p-3 rounded-lg bg-[#F7F7F5] border border-[#E7E7E5]">
          <p className="text-sm text-[#37352F]">
            <span className="font-semibold">💡 AI says:</span> {aiInsight}
          </p>
        </div>
      )}

      {/* Skills */}
      <div className="flex flex-wrap gap-2">
        {skills.slice(0, 5).map((skill) => (
          <Badge key={skill} variant="outline">
            {skill}
          </Badge>
        ))}
        {skills.length > 5 && (
          <Badge variant="outline" className="text-[#73726E]">
            +{skills.length - 5} more
          </Badge>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-[#E7E7E5]" />

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button onClick={onReview} variant="primary" className="flex-1">
          <Eye className="w-4 h-4 mr-2" />
          Review CL
        </Button>
        <Button onClick={onEdit} variant="secondary" className="flex-1">
          <Edit className="w-4 h-4 mr-2" />
          Edit
        </Button>
        <Button onClick={onSkip} variant="ghost" className="px-4">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Swipe Hint */}
      <p className="text-xs text-center text-[#A8A29E]">
        ← Swipe Left = Skip | Swipe Right = Review →
      </p>
    </motion.div>
  );
}

// ============================================================================
// USAGE EXAMPLE (Comment out in production)
// ============================================================================

/*
<JobCard
  company="Stripe"
  logo="/logos/stripe.png"
  jobTitle="Senior Backend Engineer"
  location="Berlin"
  salary="€90-120k"
  remote="Full Remote"
  matchScore={95}
  aiInsight="Perfect match - your Python exp + their payment infra needs"
  skills={['Python', 'Kubernetes', 'gRPC', 'PostgreSQL', 'Redis']}
  onReview={() => console.log('Review')}
  onEdit={() => console.log('Edit')}
  onSkip={() => console.log('Skip')}
/>
*/
