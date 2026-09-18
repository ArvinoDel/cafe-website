'use client';

import { motion } from 'framer-motion';
import { Sprout, HandHeart, Globe2 } from 'lucide-react';
import {
  fadeInUp,
  staggerContainer,
  slideInLeft,
  slideInRight,
} from '@/lib/animations';

const commitments = [
  {
    icon: Sprout,
    title: 'Quality Sourced Beans',
    desc: 'We source our coffee beans directly from carefully selected farms, each chosen for their unique flavour profile.',
  },
  {
    icon: HandHeart,
    title: 'Supporting Farmers',
    desc: 'Every cup you enjoy supports the farmers behind it. Direct relationships, fair prices, and shared values.',
  },
  {
    icon: Globe2,
    title: 'Eco-Conscious Approach',
    desc: 'From natural lighting design to thoughtful packaging, we work toward a lighter footprint with every decision.',
  },
];

export type LocalRootsContent = {
  tag?: string;
  title?: string;
  titleAccent?: string;
  description?: string;
  stats?: { value: string; label: string }[];
  commitments?: { icon?: string; title: string; desc: string }[];
  storyImageUrl?: string;
  storyImageAlt?: string;
};

const defaultCommitmentIcons = [Sprout, HandHeart, Globe2];

export default function LocalRoots({ content }: { content?: LocalRootsContent }) {
  const tag = content?.tag || 'Our Story';
  const title = content?.title || 'Rooted in craft,';
  const titleAccent = content?.titleAccent || 'driven by passion.';
  const description = content?.description || "We started small — a simple idea that great coffee and honest food should be easy for everyone to enjoy. Today we're proud to serve our community every day, with the same care and quality we started with.";
  const stats = content?.stats && content.stats.length >= 2 ? content.stats : [
    { value: '100%', label: 'Quality Sourced' },
    { value: '5★', label: 'Rated by guests' },
  ];
  const commitmentItems = content?.commitments && content.commitments.length > 0 ? content.commitments : commitments;
  const storyImageUrl = content?.storyImageUrl || 'https://images.pexels.com/photos/9535503/pexels-photo-9535503.jpeg?auto=compress&cs=tinysrgb&h=650&w=940';
  const storyImageAlt = content?.storyImageAlt || 'Freshly sourced coffee beans';

  return (
    <section
      id="story"
      className="py-20 sm:py-28 bg-coffee-900 relative overflow-hidden"
    >
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-coffee-700/50 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-coffee-600/30 rounded-full blur-3xl" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left: Image */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={slideInLeft}
            className="relative"
          >
            <div className="relative rounded-3xl overflow-hidden shadow-soft-xl aspect-[4/3]">
              <img
                src={storyImageUrl}
                alt={storyImageAlt}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-coffee-950/40 to-transparent" />
            </div>

            {/* Stats overlay */}
            <div className="absolute -bottom-6 -right-2 sm:right-6 bg-white rounded-2xl shadow-soft-lg p-5 sm:p-6">
              <p className="text-3xl sm:text-4xl font-extrabold text-coffee-700">{stats[0]?.value || '100%'}</p>
              <p className="text-sm text-charcoal/60 mt-1">{stats[0]?.label || 'Quality Sourced'}</p>
            </div>
            <div className="absolute -top-4 -left-2 sm:left-6 bg-sand-300 rounded-2xl shadow-soft p-4 sm:p-5">
              <p className="text-2xl sm:text-3xl font-extrabold text-coffee-900">{stats[1]?.value || '5★'}</p>
              <p className="text-xs sm:text-sm text-coffee-800/70 mt-1">{stats[1]?.label || 'Rated by guests'}</p>
            </div>
          </motion.div>

          {/* Right: Copy */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={staggerContainer}
          >
            <motion.span
              variants={fadeInUp}
              className="text-sm font-semibold text-sand-300 uppercase tracking-wider"
            >
              {tag}
            </motion.span>

            <motion.h2
              variants={fadeInUp}
              className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight text-balance leading-[1.15]"
            >
              {title}
              <br />
              <span className="text-sand-300">{titleAccent}</span>
            </motion.h2>

            <motion.p
              variants={fadeInUp}
              className="mt-5 text-lg text-white/60 leading-relaxed max-w-lg"
            >
              {description}
            </motion.p>

            {/* Commitment items */}
            <motion.div
              variants={fadeInUp}
              className="mt-8 space-y-5"
            >
              {commitmentItems.map((item, idx) => {
                const Icon = defaultCommitmentIcons[idx % defaultCommitmentIcons.length];
                return (
                  <div key={item.title || idx} className="flex items-start gap-4 group">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-coffee-800 border border-coffee-700 text-sand-300 flex-shrink-0 transition-colors group-hover:bg-sand-300 group-hover:text-coffee-900">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-bold text-white text-lg">{item.title}</p>
                      <p className="text-white/50 text-sm leading-relaxed mt-0.5">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
