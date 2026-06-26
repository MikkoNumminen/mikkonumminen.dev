"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { CombatSummary } from "@/game/phaser";
import type { MissionDefinition, MissionId } from "@/types";
import { combatMusic, resolveCombatTrack } from "@/game/audio";
import HudFrame from "@/components/galaxy/HudFrame";
import QuestPanel from "@/components/galaxy/QuestPanel";
import VictoryModal from "@/components/galaxy/VictoryModal";
import WarpPicker from "@/components/galaxy/WarpPicker";
import StoryModal from "@/components/story/StoryModal";
import StoryListModal from "@/components/story/StoryListModal";
import GalaxyStatusOverlays from "@/components/galaxy/GalaxyStatusOverlays";
import Splash, { type SplashStep } from "@/components/Splash";
import SplashGate from "@/components/SplashGate";
import SaveLoadErrorOverlay from "@/components/SaveLoadErrorOverlay";
import { useCloudSaveSync } from "@/components/hooks/useCloudSaveSync";
import { useGalaxyTransition } from "@/components/hooks/useGalaxyTransition";
import {
  clearLoadSaveCache,
  useGameState,
  setSolarSystem,
  useOptimisticAuth
} from "@/game/state";
import { useGalaxyScene } from "@/components/hooks/useGalaxyScene";
import { usePhaserGame } from "@/components/hooks/usePhaserGame";
import { useStoryTriggers } from "@/components/hooks/useStoryTriggers";
import { useGameMode } from "@/components/hooks/useGameMode";
import { useTransitionOverlay } from "@/components/hooks/useTransitionOverlay";
import { useVictoryFlow } from "@/components/hooks/useVictoryFlow";
import { getAllMissions, getAllSolarSystems, getMission, getStoryEntry } from "@/game/data";
import { ROUTES } from "@/lib/routes";

export default function GameCanvas() {
  const galaxyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const combatParentRef = useRef<HTMLDivElement | null>(null);

  const router = useRouter();
  const { status: authStatus, data: session } = useSession();
  const sessionEmail = session?.user?.email ?? null;
  const { isVerified } = useOptimisticAuth();
  const [hovered, setHovered] = useState<MissionDefinition | null>(null);
  const [focusedPlanetId, setFocusedPlanetId] = useState<MissionId | null>(null);
  const [warpOpen, setWarpOpen] = useState(false);
  const currentSolarSystemId = useGameState((s) => s.currentSolarSystemId);
  const unlockedSolarSystems = useGameState((s) => s.unlockedSolarSystems);
  const completedMissions = useGameState((s) => s.completedMissions);
  const unlockedPlanets = useGameState((s) => s.unlockedPlanets);
  const seenStoryEntries = useGameState((s) => s.seenStoryEntries);

  const handleWarpToNextSystem = useCallback(() => {
    const completed = new Set(completedMissions);
    const systemIds = getAllSolarSystems().map((s) => s.id);
    const currentIdx = systemIds.indexOf(currentSolarSystemId);
    for (let step = 1; step <= systemIds.length; step++) {
      const candidateId = systemIds[(currentIdx + step) % systemIds.length];
      if (!candidateId || candidateId === currentSolarSystemId) continue;
      if (!unlockedSolarSystems.includes(candidateId)) continue;
      const hasUnfinished = getAllMissions().some(
        (m) => m.solarSystemId === candidateId && m.kind === "mission" && !completed.has(m.id)
      );
      if (hasUnfinished) {
        setSolarSystem(candidateId);
        return;
      }
    }
    setWarpOpen(true);
  }, [completedMissions, currentSolarSystemId, unlockedSolarSystems]);

  const saveSync = useCloudSaveSync();
  const saveLoaded = saveSync.status === "loaded";
  // The overlay starts visible whenever the load fails. Dismissing it
  // doesn't clear the underlying status — saveNow stays gated by the
  // hydration flag in syncCache, so even an "I understand the risk"
  // dismissal can't trigger an INITIAL_STATE POST that would wipe the
  // server save. This bool just removes the visual blocker.
  const [errorDismissed, setErrorDismissed] = useState(false);
  const showLoadError = saveSync.status === "load-failed" && !errorDismissed;
  // Reset the dismissal whenever a successful load happens (e.g. retry
  // succeeds after an earlier failure), so a future failure cycle re-blocks
  // instead of being silently dismissed from the previous one.
  useEffect(() => {
    if (saveSync.status === "loaded") setErrorDismissed(false);
  }, [saveSync.status]);

  const handleRetryLoad = useCallback(() => {
    // clearLoadSaveCache wipes the cache + lastLoadResult + hydration flag.
    // The simplest reliable retry is a full reload: it re-runs the splash
    // gate's loadSave with a clean slate, and avoids needing to thread a
    // re-fetch trigger through useReliableSession (which is what otherwise
    // gates the useCloudSaveSync effect).
    clearLoadSaveCache();
    setErrorDismissed(false);
    window.location.reload();
  }, []);

  const { overlayRef, fadeOverlay } = useTransitionOverlay();

  // useStoryTriggers needs `mode === "galaxy"` to gate its schedulers, and
  // useGameMode needs `cancelPendingBriefing` from useStoryTriggers — but
  // we can resolve the apparent circular dep by initialising the mode hook
  // first (it doesn't read story state) and then handing its `mode` value
  // into useStoryTriggers. The briefing-cancel arrives via a ref slot
  // populated immediately after useStoryTriggers returns.
  const cancelBriefingRef = useRef<() => void>(() => undefined);
  const stableCancelBriefing = useCallback(() => cancelBriefingRef.current(), []);

  const { mode, setMode, launching, setLaunching } = useGameMode({
    cancelPendingBriefing: stableCancelBriefing
  });

  const {
    activeStory,
    setActiveStory,
    storyListOpen,
    setStoryListOpen,
    handleMissionSelect,
    handleMarkStorySeen,
    handleReplayStory,
    cancelPendingBriefing
  } = useStoryTriggers({
    enabled: mode === "galaxy",
    saveLoaded,
    currentSolarSystemId,
    unlockedPlanets,
    completedMissions,
    seenStoryEntries
  });
  cancelBriefingRef.current = cancelPendingBriefing;

  // Planet click in the 3D scene flows into QuestPanel as a focus signal so
  // the matching entry expands inline. Clearing on null lets a click on
  // empty space collapse-back through the panel's own toggle.
  const handleSceneSelect = useCallback((mission: MissionDefinition | null) => {
    setFocusedPlanetId(mission?.id ?? null);
  }, []);

  const { ready: sceneReady, error: galaxyError } = useGalaxyScene({
    enabled: mode === "galaxy",
    canvasRef: galaxyCanvasRef,
    currentSolarSystemId,
    completedMissions,
    unlockedPlanets,
    onHover: setHovered,
    onSelect: handleSceneSelect
  });

  // Galaxy boot-latch + warp-transition flag + canvas-hiding nav helper.
  // See useGalaxyTransition for why leaveGalaxy must hide the canvas
  // synchronously before router.push.
  const { showGalaxyTransition, leaveGalaxy } = useGalaxyTransition({
    mode,
    sceneReady,
    galaxyError,
    showLoadError,
    canvasRef: galaxyCanvasRef,
    router
  });

  const handleLaunch = useCallback(
    async (mission: MissionDefinition) => {
      // Defensive: scenery bodies have no action and shouldn't reach here
      // (QuestPanel and the raycaster filter them out), but if a click
      // sneaks through, do nothing rather than launching a no-op combat.
      if (mission.kind === "scenery") return;
      if (mission.kind === "shop") {
        // Client-side nav preserves in-memory GameState (credits etc.).
        leaveGalaxy(ROUTES.page.shop);
        return;
      }
      setFocusedPlanetId(null);
      // Start fetching + playing the mission bed BEFORE the fade-to-black so
      // the audio is up by the time the combat scene appears. CombatScene's
      // own loadTrack call later is a no-op when the src already matches —
      // resolveCombatTrack guarantees both sites pick the same src (incl.
      // the fallback for missions with no dedicated track).
      combatMusic.loadTrack(resolveCombatTrack(mission.musicTrack));
      await fadeOverlay(1);
      setLaunching(mission);
      setMode("combat");
      requestAnimationFrame(() => void fadeOverlay(0));
    },
    [fadeOverlay, leaveGalaxy, setLaunching, setMode]
  );

  const onCombatExit = useCallback(() => {
    setLaunching(null);
    setMode("galaxy");
  }, [setLaunching, setMode]);

  const { lastSummary, setLastSummary, syncStatus, handleMissionComplete } = useVictoryFlow({
    authStatus,
    sessionEmail,
    currentSolarSystemId,
    completedMissions,
    unlockedSolarSystems,
    fadeOverlay,
    onCombatExit
  });

  // Route Phaser's onComplete through a ref so a mid-combat auth flip
  // ("loading" → "authenticated") doesn't leave Phaser holding a stale
  // closure that skips saveNow()/submitScore(). Re-instantiating Phaser
  // on auth changes would be wasteful (and would tear down the active
  // game), so the ref pattern is the correct fix here.
  const completeRef = useRef<(summary: CombatSummary) => void | Promise<void>>(() => undefined);
  completeRef.current = handleMissionComplete;
  const stableComplete = useCallback(
    (summary: CombatSummary) => completeRef.current(summary),
    []
  );

  const { error: combatError } = usePhaserGame({
    enabled: mode === "combat",
    parentRef: combatParentRef,
    missionId: launching?.id ?? null,
    onComplete: stableComplete
  });
  const rendererError = mode === "combat" ? combatError : galaxyError;

  const splashSteps = useMemo<readonly SplashStep[]>(
    () => [
      { label: "verify pilot session", done: isVerified },
      { label: "load saved progress", done: saveLoaded },
      { label: "spin up galaxy", done: sceneReady }
    ],
    [isVerified, saveLoaded, sceneReady]
  );
  const ready = isVerified && saveLoaded && sceneReady;

  return (
    <>
    <SplashGate
      ready={ready}
      failed={saveSync.status === "load-failed"}
      splash={<Splash steps={splashSteps} />}
    >
    <div className="relative h-dvh w-dvw overflow-hidden bg-space-bg">
      {mode === "galaxy" && (
        // INVARIANT: keyed on currentSolarSystemId so React unmounts the old
        // canvas and mounts a fresh one whenever the active system changes
        // (warp). SceneRig.dispose() calls renderer.forceContextLoss() to
        // reclaim the WebGL context budget on galaxy↔combat cycling — that's
        // only safe when the canvas DOM element is also going away. Reusing
        // the same canvas across a warp would leave it in a permanently-lost
        // context state, and the next `new THREE.WebGLRenderer({ canvas })`
        // would throw deterministically (all 3 retries in useGalaxyScene
        // would hit the same failure). The key forces the canvas to die
        // alongside its old context.
        <canvas
          ref={galaxyCanvasRef}
          key={currentSolarSystemId}
          className="block h-full w-full bg-space-bg"
        />
      )}
      {mode === "combat" && (
        <div ref={combatParentRef} className="h-full w-full bg-space-bg" />
      )}

      {mode === "galaxy" && ready && (
        <div className="pointer-events-none absolute inset-0">
          <HudFrame
            hovered={hovered}
            onBackToMenu={() => leaveGalaxy(ROUTES.page.home)}
            onOpenWarp={() => setWarpOpen(true)}
            warpAvailable={unlockedSolarSystems.length > 1}
            onOpenStoryList={() => setStoryListOpen(true)}
          />
          <QuestPanel
            currentSolarSystemId={currentSolarSystemId}
            focusedPlanetId={focusedPlanetId}
            onLaunch={handleLaunch}
            onWarpToNext={handleWarpToNextSystem}
            onMissionSelect={handleMissionSelect}
          />
          {warpOpen && (
            <WarpPicker
              currentSystemId={currentSolarSystemId}
              unlockedSystemIds={unlockedSolarSystems}
              onClose={() => setWarpOpen(false)}
              onSelect={(id) => {
                setSolarSystem(id);
                setWarpOpen(false);
              }}
            />
          )}
          {lastSummary && (
            <VictoryModal
              summary={lastSummary}
              missionName={getMission(lastSummary.missionId).name}
              syncStatus={syncStatus}
              onClose={() => setLastSummary(null)}
            />
          )}
          {storyListOpen && (
            <StoryListModal
              seenStoryEntries={seenStoryEntries}
              onReplay={handleReplayStory}
              onClose={() => setStoryListOpen(false)}
            />
          )}
          {activeStory && (
            <StoryModal
              entry={getStoryEntry(activeStory.id)}
              mode={activeStory.fromLog ? "replay-from-log" : "first-time"}
              firstSeen={activeStory.firstSeen}
              onClose={() => {
                if (activeStory.fromLog) {
                  // Back from a replay returns to the Story log — keep the
                  // bed running, just swap the visible modal back.
                  setActiveStory(null);
                  setStoryListOpen(true);
                } else {
                  setActiveStory(null);
                }
              }}
              onMarkSeen={handleMarkStorySeen}
            />
          )}
        </div>
      )}

      <div
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 bg-black"
        style={{ opacity: 0 }}
      />
    </div>
    </SplashGate>
    {/*
      Defense-in-depth: SaveLoadErrorOverlay is a SIBLING of SplashGate
      (not a child) so even if a future SplashGate regression keeps the
      splash mounted on `failed`, the overlay still renders unblocked.
      The overlay also uses z-[60] (vs the splash's z-50) so any stacking
      surprise still resolves in the overlay's favor.
    */}
    {showLoadError && (
      <SaveLoadErrorOverlay
        reason={saveSync.status === "load-failed" ? saveSync.reason : undefined}
        onRetry={handleRetryLoad}
        onDismiss={() => setErrorDismissed(true)}
      />
    )}
    <GalaxyStatusOverlays
      showTransition={showGalaxyTransition}
      rendererError={rendererError}
      showLoadError={showLoadError}
    />
    </>
  );
}
