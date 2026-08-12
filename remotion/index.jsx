import React from 'react';
import { Composition, registerRoot } from 'remotion';
import PodcastStudioComposition from '../src/video/PodcastStudioComposition';
import DocumentSummaryComposition from '../src/video/DocumentSummaryComposition';
import SocialShortComposition from '../src/video/SocialShortComposition';
import { ASPECT_RATIOS } from '../src/video/timeline';

const defaultTimeline = { fps: 30, durationInFrames: 300, width: 1920, height: 1080, turns: [], slides: [] };

function Root() {
  return <>
    <Composition id="PodcastStudioComposition" component={PodcastStudioComposition} durationInFrames={300} fps={30} width={ASPECT_RATIOS.landscape.width} height={ASPECT_RATIOS.landscape.height} defaultProps={{ timeline: defaultTimeline, showCaptions: true }} />
    <Composition id="DocumentSummaryComposition" component={DocumentSummaryComposition} durationInFrames={300} fps={30} width={ASPECT_RATIOS.landscape.width} height={ASPECT_RATIOS.landscape.height} defaultProps={{ timeline: defaultTimeline, showCaptions: true }} />
    <Composition id="SocialShortComposition" component={SocialShortComposition} durationInFrames={300} fps={30} width={ASPECT_RATIOS.portrait.width} height={ASPECT_RATIOS.portrait.height} defaultProps={{ timeline: { ...defaultTimeline, width: 1080, height: 1920 }, showCaptions: true }} />
  </>;
}

registerRoot(Root);
