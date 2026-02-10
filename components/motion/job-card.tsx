"use client";

import React, { useState } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Eye, Edit, X, MapPin, DollarSign, Briefcase, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Badge } from './badge';
import { AnimatedMatchScore } from './count-up';

// ============================================================================
// FLUID JOB CARD - Tinder-Style with Visual Feedback
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
  index?: number;
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
  index = 0,
}: JobCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0.5, 1, 1, 1, 0.5]);
  
  // Visual feedback overlays
  const approveOpacity = useTransform(x, [0, 100], [0, 1]);
  const rejectOpacity = useTransform(x, [-100, 0], [1, 0]);
  const approveScale = useTransform(x, [0, 150], [0.8, 1.2]);
  const rejectScale = useTransform(x, [-150, 0], [1.2, 0.8]);

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    setIsDragging(false);
    
    if (info.offset.x > 100) {
      // Approve animation before callback
      setTimeout(() => onReview(), 200);
    } else if (info.offset.x < -100) {
      // Reject animation before callback
      setTimeout(() => onSkip(), 200);
    }
  };

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      style={{ x, rotate, opacity }}
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
      transition={{ delay: index * 0.1, duration: 0.4, ease: "easeOut" }}
      whileHover={!isDragging ? { scale: 1.02, y: -4, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" } : {}}
      className={cn(
        "w-full max-w-2xl bg-white rounded-xl border border-[#E7E7E5]",
        "shadow-sm transition-shadow relative overflow-hidden",
        "p-6 space-y-4",
        isDragging ? "cursor-grabbing" : "cursor-grab",
        className
      )}
    >
      {/* Approve Overlay (Right Swipe) */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-[#00C853]/10 to-[#00C853]/30 pointer-events-none flex items-center justify-end pr-12"
        style={{ opacity: approveOpacity }}
      >
        <motion.div
          className="w-20 h-20 rounded-full bg-[#00C853] flex items-center justify-center shadow-2xl"
          style={{ scale: approveScale }}
        >
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 0.6, repeat: Infinity }}
          >
            <Sparkles className="w-10 h-10 text-white" strokeWidth={2.5} />
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Reject Overlay (Left Swipe) */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-l from-transparent via-[#D32F2F]/10 to-[#D32F2F]/30 pointer-events-none flex items-center justify-start pl-12"
        style={{ opacity: rejectOpacity }}
      >
        <motion.div
          className="w-20 h-20 rounded-full bg-[#D32F2F] flex items-center justify-center shadow-2xl"
          style={{ scale: rejectScale }}
        >
          <motion.div
            animate={{ rotate: [0, -10, 10, -10, 0] }}
            transition={{ duration: 0.5, repeat: Infinity }}
          >
            <X className="w-10 h-10 text-white" strokeWidth={2.5} />
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Header: Company + Match Score */}
      <div className="flex items-start justify-between relative z-10">
        <div className="flex items-center gap-3">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: index * 0.1 + 0.2, type: "spring", stiffness: 200 }}
          >
            {logo ? (
              <img src={logo} alt={company} className="w-12 h-12 rounded-lg object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#F7F7F5] to-[#E7E7E5] flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-[#73726E]" />
              </div>
            )}
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 + 0.3 }}
          >
            <h3 className="text-lg font-semibold text-[#37352F]">{company}</h3>
            <p className="text-sm text-[#73726E]">{jobTitle}</p>
          </motion.div>
        </div>

        {/* Match Score Badge */}
        <AnimatedMatchScore score={matchScore} />
      </div>

      {/* Job Details */}
      <motion.div 
        className="flex items-center gap-4 text-sm text-[#73726E]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: index * 0.1 + 0.4 }}
      >
        <motion.div 
          className="flex items-center gap-1"
          whileHover={{ scale: 1.05, color: "#37352F" }}
        >
          <MapPin className="w-4 h-4" />
          {location}
        </motion.div>
        <motion.div 
          className="flex items-center gap-1"
          whileHover={{ scale: 1.05, color: "#37352F" }}
        >
          <DollarSign className="w-4 h-4" />
          {salary}
        </motion.div>
        {remote && (
          <Badge variant="secondary" interactive className="ml-auto">
            {remote}
          </Badge>
        )}
      </motion.div>

      {/* AI Insight */}
      {aiInsight && (
        <motion.div 
          className="p-3 rounded-lg bg-gradient-to-br from-[#F7F7F5] to-[#FAFAF9] border border-[#E7E7E5]"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 + 0.5 }}
          whileHover={{ scale: 1.01, borderColor: "#0066FF" }}
        >
          <p className="text-sm text-[#37352F]">
            <motion.span 
              className="font-semibold inline-flex items-center gap-1"
              animate={{ opacity: [1, 0.7, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              💡 AI says:
            </motion.span>{" "}
            {aiInsight}
          </p>
        </motion.div>
      )}

      {/* Skills */}
      <motion.div 
        className="flex flex-wrap gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: index * 0.1 + 0.6 }}
      >
        {skills.slice(0, 5).map((skill, i) => (
          <motion.div
            key={skill}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 + 0.6 + i * 0.05 }}
          >
            <Badge variant="outline" interactive>
              {skill}
            </Badge>
          </motion.div>
        ))}
        {skills.length > 5 && (
          <Badge variant="outline" className="text-[#73726E]">
            +{skills.length - 5} more
          </Badge>
        )}
      </motion.div>

      {/* Divider */}
      <motion.div 
        className="h-px bg-gradient-to-r from-transparent via-[#E7E7E5] to-transparent"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: index * 0.1 + 0.7, duration: 0.5 }}
      />

      {/* Actions */}
      <motion.div 
        className="flex items-center gap-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1 + 0.8 }}
      >
        <Button onClick={onReview} variant="primary" className="flex-1">
          <Eye className="w-4 h-4 mr-2" />
          Review CL
        </Button>
        <Button onClick={onEdit} variant="secondary" className="flex-1">
          <Edit className="w-4 h-4 mr-2" />
          Edit
        </Button>
        <Button onClick={onSkip} variant="ghost" size="icon">
          <X className="w-4 h-4" />
        </Button>
      </motion.div>

      {/* Swipe Hint */}
      <motion.p 
        className="text-xs text-center text-[#A8A29E]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: index * 0.1 + 0.9 }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        ← Swipe Left = Skip | Swipe Right = Review →
      </motion.p>
    </motion.div>
  );
}
