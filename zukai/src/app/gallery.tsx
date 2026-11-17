/**
 * ZUKAI — Component Gallery (Phase UI-V2)
 * Comprehensive visual catalog of all design tokens, HeroCard variants,
 * glossy shine controls, round arrow buttons, and halo play buttons.
 */

import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Zap, Sparkles, AlertTriangle, Upload, ArrowUpRight, Flame, Headphones, BookOpen } from 'lucide-react-native';
import { MeshBackground } from '../components/MeshBackground';
import { GlassCard } from '../components/GlassCard';
import { HeroCard } from '../components/HeroCard';
import { Text } from '../components/Text';
import { ShinyButton } from '../components/ShinyButton';
import { RoundArrowButton } from '../components/RoundArrowButton';
import { HaloPlayButton } from '../components/HaloPlayButton';
import { ProgressBar } from '../components/ProgressBar';
import { Waveform } from '../components/Waveform';
import { LanguageToggle, Language } from '../components/LanguageToggle';
import { Mascot } from '../components/Mascot';
import { type MascotPose } from '../assets/mascot/index';

const C = {
  brandHero: '#8EF20F',
  textPrimary: '#F4F7F2',
  textSecondary: '#B5C4CC',
  textTertiary: '#6B828F',
  textInverse: '#0B1418',
};

const ALL_POSES: MascotPose[] = [
  'wave',
  'reading',
  'headphones',
  'lightbulb',
  'typing',
  'carrying_document',
  'trophy',
  'graduation',
  'flame',
  'hourglass',
  'coffee',
  'sleeping',
  'confused',
  'crown',
  'pointing',
  'thumbs_up',
];

export default function GalleryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [lang, setLang] = useState<Language>('english');
  const [isPlaying, setIsPlaying] = useState(true);

  return (
    <View style={s.root}>
      <MeshBackground variant="home" />

      {/* Top Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={C.textSecondary} />
        </Pressable>
        <Text variant="headline" rawColor={C.textPrimary}>Component Gallery (UI-V2)</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. HEROCARD VARIANTS ── */}
        <Text variant="title3" rawColor={C.brandHero} style={s.sectionTitle}>1. HeroCard Variants</Text>

        {/* 1A. Wide Lime Card */}
        <HeroCard
          variant="lime"
          size="wide"
          mascot="wave"
          animated
          onPress={() => {}}
        >
          <Text variant="title2" rawColor="#0B1418" style={{ fontWeight: '800' }}>
            Lime Hero Card
          </Text>
          <Text variant="footnote" rawColor="rgba(11,20,24,0.75)" style={{ marginTop: 4 }}>
            160° Lime gradient, silk-wave texture overlay, top reflection crescent, dark text.
          </Text>
          <View style={{ marginTop: 12, alignSelf: 'flex-start' }}>
            <ShinyButton variant="dark-glossy" size="sm" label="Dark Glossy CTA" onPress={() => {}} />
          </View>
        </HeroCard>

        {/* 1B. Wide Forest Card */}
        <HeroCard
          variant="forest"
          size="wide"
          mascot="headphones"
          onPress={() => {}}
        >
          <Text variant="title2" rawColor={C.textPrimary} style={{ fontWeight: '800' }}>
            Forest Hero Card
          </Text>
          <Text variant="footnote" rawColor={C.textSecondary} style={{ marginTop: 4 }}>
            Deep green #0F2A12 to #0B1418 with ambient lime glow and light text.
          </Text>
          <View style={{ marginTop: 12, alignSelf: 'flex-start' }}>
            <ShinyButton variant="primary" size="sm" label="Lime CTA" onPress={() => {}} />
          </View>
        </HeroCard>

        {/* 1C. Tall Lime Card */}
        <View style={{ width: '60%' }}>
          <HeroCard
            variant="lime"
            size="tall"
            mascot="trophy"
            onPress={() => {}}
          >
            <Text variant="headline" rawColor="#0B1418" style={{ fontWeight: '800' }}>
              Tall Card
            </Text>
            <Text variant="caption" rawColor="rgba(11,20,24,0.75)" style={{ marginTop: 4 }}>
              Text at top, mascot at bottom.
            </Text>
            <View style={{ marginTop: 10 }}>
              <ShinyButton variant="dark-glossy" size="sm" label="Action" onPress={() => {}} />
            </View>
          </HeroCard>
        </View>

        {/* 1D. Compact Glass Card */}
        <HeroCard
          variant="glass"
          size="compact"
          mascot="pointing"
          onPress={() => {}}
        >
          <Text variant="headline" rawColor={C.textPrimary} style={{ fontWeight: '700' }}>
            Compact Glass Card
          </Text>
          <Text variant="caption" rawColor={C.textSecondary}>
            Sleek surface for jobs & updates.
          </Text>
        </HeroCard>

        {/* ── 2. GLOSSY SHINE BUTTON SYSTEM ── */}
        <Text variant="title3" rawColor={C.brandHero} style={s.sectionTitle}>2. Glossy Shine Buttons</Text>
        <GlassCard style={s.card}>
          <ShinyButton
            label="Primary Lime CTA (Shimmer Loop)"
            variant="primary"
            size="lg"
            fullWidth
            icon={<Zap size={18} color="#0B1418" />}
            onPress={() => {}}
          />

          <ShinyButton
            label="Dark Glossy Button (For Lime Cards)"
            variant="dark-glossy"
            size="md"
            fullWidth
            icon={<Upload size={16} color="#FFF" />}
            onPress={() => {}}
          />

          <ShinyButton
            label="Glass Button"
            variant="glass"
            size="md"
            fullWidth
            icon={<Sparkles size={16} color={C.textPrimary} />}
            onPress={() => {}}
          />

          <ShinyButton
            label="Destructive Button"
            variant="destructive"
            size="md"
            fullWidth
            icon={<AlertTriangle size={16} color="#fff" />}
            onPress={() => {}}
          />

          {/* Sizes Row */}
          <View style={s.row}>
            <ShinyButton label="Large (52dp)" variant="primary" size="lg" onPress={() => {}} />
            <ShinyButton label="Medium (44dp)" variant="primary" size="md" onPress={() => {}} />
            <ShinyButton label="Small (36dp)" variant="primary" size="sm" onPress={() => {}} />
          </View>
        </GlassCard>

        {/* ── 3. SPECIALIZED ROUND & HALO BUTTONS ── */}
        <Text variant="title3" rawColor={C.brandHero} style={s.sectionTitle}>3. Round Arrow & Halo Buttons</Text>
        <GlassCard style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }}>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <RoundArrowButton variant="dark-glossy" size={36} onPress={() => {}} />
              <Text variant="caption" rawColor={C.textSecondary}>Dark Glossy</Text>
            </View>

            <View style={{ alignItems: 'center', gap: 6 }}>
              <RoundArrowButton variant="lime" size={36} onPress={() => {}} />
              <Text variant="caption" rawColor={C.textSecondary}>Lime</Text>
            </View>

            <View style={{ alignItems: 'center', gap: 6 }}>
              <RoundArrowButton variant="glass" size={36} onPress={() => {}} />
              <Text variant="caption" rawColor={C.textSecondary}>Glass</Text>
            </View>

            <View style={{ alignItems: 'center', gap: 6 }}>
              <HaloPlayButton
                isPlaying={isPlaying}
                size={54}
                ringOffset={6}
                onPress={() => setIsPlaying((p) => !p)}
              />
              <Text variant="caption" rawColor={C.textSecondary}>Halo Play (Pulse)</Text>
            </View>
          </View>
        </GlassCard>

        {/* ── 4. CHUNKY PROGRESS BARS ── */}
        <Text variant="title3" rawColor={C.brandHero} style={s.sectionTitle}>4. Chunky Progress Bars</Text>
        <GlassCard style={s.card}>
          <ProgressBar progress={72} height={14} label="72% Explaining" />
          <ProgressBar progress={35} height={10} />
          <ProgressBar progress={100} height={16} label="Complete" />
        </GlassCard>

        {/* ── 5. WAVEFORM SCRUBBER ── */}
        <Text variant="title3" rawColor={C.brandHero} style={s.sectionTitle}>5. Audio Waveform Scrubber</Text>
        <GlassCard style={s.card}>
          <Waveform barCount={28} height={40} active />
        </GlassCard>

        {/* ── 6. LANGUAGE / SEGMENTED CONTROLS ── */}
        <Text variant="title3" rawColor={C.brandHero} style={s.sectionTitle}>6. Segmented Controls</Text>
        <View style={{ alignItems: 'center' }}>
          <LanguageToggle value={lang} onChange={setLang} />
        </View>

        {/* ── 7. ALL 16 CORNER-READY ZUKE POSES ── */}
        <Text variant="title3" rawColor={C.brandHero} style={s.sectionTitle}>7. All 16 Zuke Mascot Poses</Text>
        <View style={s.posesGrid}>
          {ALL_POSES.map((pose) => (
            <GlassCard key={pose} style={s.poseTile} padding={10} borderRadius={16}>
              <Mascot pose={pose} size={70} animated={false} />
              <Text variant="caption" rawColor={C.textSecondary} numberOfLines={1} style={{ textAlign: 'center', marginTop: 4, fontSize: 10 }}>
                {pose}
              </Text>
            </GlassCard>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B1418' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 18, gap: 16 },
  sectionTitle: { marginTop: 12, fontWeight: '800' },
  card: { padding: 18, borderRadius: 20, gap: 14 },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  posesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  poseTile: {
    width: '23%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
