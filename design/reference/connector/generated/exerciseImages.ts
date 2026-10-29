// AI image assets: semi-realistic 3D renders, start and end positions
const HeelSlidesStart = "https://storage.googleapis.com/storage.magicpath.ai/component-assets/464510461979815936/464522994933456896/05a8def9dfd0151ba2a5ead74036aeda185589e65fbff59c237ad11cd92cbfbd.jpg";const HeelSlidesEnd = "https://storage.googleapis.com/storage.magicpath.ai/component-assets/464510461979815936/464522994933456896/37a020a543eba6c7da98277db3d9b0ae8518689ef01fac8a4b3db81811c05d88.jpg";const StraightLegRaiseStart = "https://storage.googleapis.com/storage.magicpath.ai/component-assets/464510461979815936/464522994933456896/23a64670fd87e1995474804081d77431f9a3b2ea73526fac5e4a7aa359a9fb89.jpg";const StraightLegRaiseEnd = "https://storage.googleapis.com/storage.magicpath.ai/component-assets/464510461979815936/464522994933456896/5e7df84e0206447bdfdf606ce2e28bebf800bcb97c8cdc277507e054cfb6c838.jpg";const TerminalKneeExtensionStart = "https://storage.googleapis.com/storage.magicpath.ai/component-assets/464510461979815936/464522994933456896/b272e44d37082eedaed3c028a364f07f99d5cffd013eb763778fa9a7e4a2effd.jpg";const TerminalKneeExtensionEnd = "https://storage.googleapis.com/storage.magicpath.ai/component-assets/464510461979815936/464522994933456896/6bd446d241b7c2bca323b07cbb98ee9b370f8b46e977a61ccabae447b72a75e9.jpg";const WallSitStart = "https://storage.googleapis.com/storage.magicpath.ai/component-assets/464510461979815936/464522994933456896/eba390f99096e7cf5721dea18d289c475e2a7f1a6d5e56bcbb686f4874401ed7.jpg";const WallSitEnd = "https://storage.googleapis.com/storage.magicpath.ai/component-assets/464510461979815936/464522994933456896/3788c5e01ff73e33a13e8e8e30477862a606c32d82a8cc969a283e26421fb620.jpg";








export type ExerciseImageSet = {start: string;end: string;};
export const EXERCISE_IMAGES: Record<string, ExerciseImageSet> = {
  'heel-slides': { start: HeelSlidesStart, end: HeelSlidesEnd },
  'straight-leg-raise': { start: StraightLegRaiseStart, end: StraightLegRaiseEnd },
  'terminal-knee-extension': { start: TerminalKneeExtensionStart, end: TerminalKneeExtensionEnd },
  'wall-sit': { start: WallSitStart, end: WallSitEnd }
};