import type { StoryProgram } from '../lib/story'

/**
 * Above the Treeline — original content, written for enForma. Thirty days
 * walking up out of a valley; the first seven are written. Deliberately not
 * a fantasy quest: the effort in the story is the effort in the gym, which
 * is what makes the framing hold instead of feeling pasted on.
 *
 * Rotation, not rest: a heavy day is always followed by a light one, so the
 * streak survives the week. Movement ids reference the bundled catalogue.
 */
export const ABOVE_THE_TREELINE: StoryProgram = {
  id: 'story-above-the-treeline',
  name: 'Above the Treeline',
  tagline: 'Thirty days out of the valley. The first week is written.',
  totalDays: 30,
  tracks: [
    {
      id: 'load',
      name: 'Load',
      focus: 'Strength. Heavier carries, fewer and longer efforts.',
      blurb: 'You take the packs. The group moves at the speed you can carry.',
    },
    {
      id: 'pace',
      name: 'Pace',
      focus: 'Conditioning. Longer efforts, shorter rests.',
      blurb: 'You go ahead and find the route. You cover ground twice.',
    },
    {
      id: 'line',
      name: 'Line',
      focus: 'Core and mobility. Control before power.',
      blurb: 'You lead the technical ground, where balance matters more than force.',
    },
  ],
  days: [
    {
      day: 1,
      title: 'The road ends',
      weight: 'moderate',
      chapter:
        'The track gives out at a turning circle of packed gravel, and past it there is only the path. Somebody has hammered a post into the ground with the altitude burned into it: eleven hundred metres. The summit hut sits at three thousand and change, thirty days of walking away if you go the long way around, which is the only way anyone goes. You shoulder the pack. It is heavier than it was in the hallway at home, the way packs always are.',
      movements: [
        { exerciseId: 'Bodyweight_Squat', prescription: '3 × 15' },
        { exerciseId: 'Bodyweight_Walking_Lunge', prescription: '3 × 10 per leg' },
        { exerciseId: 'Standing_Calf_Raises', prescription: '3 × 20' },
        { exerciseId: 'Plank', prescription: '3 × 40 s' },
      ],
      ecNote: 'Add a fourth set of calf raises. Your feet will thank you on day nine.',
    },
    {
      day: 2,
      title: 'Blisters',
      weight: 'light',
      chapter:
        'Six hours in, the boots find the place on your heel they intend to work on for the next month. This is the day nobody writes home about: you walk, you stop, you tape the damage, you walk. The valley is still wide enough that the mountain looks like scenery rather than a problem. Keep today easy on purpose. Tomorrow the path forks and you will want the legs.',
      movements: [
        { exerciseId: 'Cat_Stretch', prescription: '2 × 10 slow' },
        { exerciseId: 'Standing_Hip_Circles', prescription: '2 × 10 per side' },
        { exerciseId: 'Butt_Lift_Bridge', prescription: '2 × 15' },
        { exerciseId: 'Superman', prescription: '2 × 12' },
      ],
    },
    {
      day: 3,
      title: 'The fork',
      weight: 'heavy',
      offersChoice: true,
      chapter:
        'Where the stream comes down, the path splits three ways and the group has to decide who does what for the rest of the climb. Nobody chose on day one, when everyone was fresh and lying about their fitness. Three days in, you know something true about yourself. Somebody has to carry the heavy packs. Somebody has to go ahead and find the route. Somebody has to lead the rock where the ground turns technical. Pick the one you would still pick on a bad morning.',
      movements: [
        { exerciseId: 'Farmers_Walk', prescription: '4 × 40 m, as heavy as you can hold' },
        { exerciseId: 'Dumbbell_Step_Ups', prescription: '4 × 10 per leg' },
        { exerciseId: 'Pushups', prescription: '3 × max clean reps' },
        { exerciseId: 'Mountain_Climbers', prescription: '3 × 40' },
      ],
      ecNote: 'One more farmer’s walk, and do not put it down early.',
    },
    {
      day: 4,
      title: 'First snow line',
      weight: 'light',
      chapter:
        'Two thousand metres and the last of the trees give up. Above here nothing grows that has to stand up straight. The air does the thing everyone warns you about and you notice it on the small climbs, not the big ones. Light day, and not as a favour: you go up faster over a month by never taking a day off and never making them all hard.',
      movements: [
        { exerciseId: 'Walking_Treadmill', prescription: '20 min, conversational pace' },
        { exerciseId: 'Plank', prescription: '3 × 45 s' },
        { exerciseId: 'Cat_Stretch', prescription: '2 × 10' },
      ],
      byTrack: {
        load: {
          chapter:
            'Two thousand metres and the last of the trees give up. You are carrying for three now, and the difference is not the weight, it is that the weight never comes off at the stops. Light day. Take it: the packs do not get lighter and you have twenty-six days of them.',
          movements: [
            { exerciseId: 'Farmers_Walk', prescription: '3 × 30 m, moderate' },
            { exerciseId: 'Plank', prescription: '3 × 45 s' },
            { exerciseId: 'Cat_Stretch', prescription: '2 × 10' },
          ],
        },
        pace: {
          chapter:
            'Two thousand metres and the last of the trees give up. You have walked it twice already today, once to find the way and once to come back and say so. Everyone else covers this ground once. Light day, which for you means only the one crossing.',
          movements: [
            { exerciseId: 'Walking_Treadmill', prescription: '30 min, conversational pace' },
            { exerciseId: 'Mountain_Climbers', prescription: '3 × 30' },
            { exerciseId: 'Cat_Stretch', prescription: '2 × 10' },
          ],
        },
        line: {
          chapter:
            'Two thousand metres and the last of the trees give up. You spent the afternoon on a slab the others walked around, working out where the feet go. Light day for the legs, honest work for everything that holds you still.',
          movements: [
            { exerciseId: 'Plank', prescription: '4 × 45 s' },
            { exerciseId: 'Russian_Twist', prescription: '3 × 20' },
            { exerciseId: 'Standing_Hip_Circles', prescription: '2 × 12 per side' },
          ],
        },
      },
    },
    {
      day: 5,
      title: 'The long traverse',
      weight: 'heavy',
      chapter:
        'A day of sideways. The path cuts across the face rather than up it, which sounds generous and is not: nothing about a traverse lets you settle into a rhythm. Eight hours of adjusting. You arrive at the col having gained two hundred metres and spent everything.',
      movements: [
        { exerciseId: 'Bodyweight_Walking_Lunge', prescription: '4 × 14 per leg' },
        { exerciseId: 'Dumbbell_Step_Ups', prescription: '4 × 12 per leg' },
        { exerciseId: 'Sit-Up', prescription: '3 × 20' },
        { exerciseId: 'Standing_Calf_Raises', prescription: '4 × 20' },
      ],
      ecNote: 'Finish with a two minute wall sit. That is what the traverse felt like.',
      byTrack: {
        load: {
          movements: [
            { exerciseId: 'Farmers_Walk', prescription: '5 × 40 m, heavy' },
            { exerciseId: 'Dumbbell_Step_Ups', prescription: '4 × 12 per leg' },
            { exerciseId: 'Bodyweight_Walking_Lunge', prescription: '3 × 12 per leg' },
            { exerciseId: 'Sit-Up', prescription: '3 × 20' },
          ],
        },
        pace: {
          movements: [
            { exerciseId: 'Mountain_Climbers', prescription: '5 × 45, 30 s rest' },
            { exerciseId: 'Bodyweight_Walking_Lunge', prescription: '4 × 14 per leg' },
            { exerciseId: 'Rowing_Stationary', prescription: '10 min, hard' },
            { exerciseId: 'Sit-Up', prescription: '3 × 20' },
          ],
        },
        line: {
          movements: [
            { exerciseId: 'Bodyweight_Walking_Lunge', prescription: '4 × 12 per leg, slow' },
            { exerciseId: 'Plank', prescription: '4 × 60 s' },
            { exerciseId: 'Russian_Twist', prescription: '4 × 20' },
            { exerciseId: 'Superman', prescription: '3 × 15' },
          ],
        },
      },
    },
    {
      day: 6,
      title: 'Weather comes in',
      weight: 'moderate',
      chapter:
        'The cloud arrives from below, which is the detail nobody believes until they see it. By noon the visibility is thirty metres and the decision is whether to sit it out or keep going on compass. You keep going. Not heroism — the col has no water and the next one does.',
      movements: [
        { exerciseId: 'Pushups', prescription: '4 × max clean reps' },
        { exerciseId: 'Bent_Over_Two-Dumbbell_Row', prescription: '4 × 12' },
        { exerciseId: 'Bench_Dips', prescription: '3 × 12' },
        { exerciseId: 'Plank', prescription: '3 × 60 s' },
      ],
      byTrack: {
        pace: {
          chapter:
            'The cloud arrives from below. You are the one on the compass, thirty metres of visibility and a bearing, walking out ahead and coming back to say the ground is where you said it would be. Four times. The others walked it once.',
          movements: [
            { exerciseId: 'Rowing_Stationary', prescription: '15 min steady' },
            { exerciseId: 'Pushups', prescription: '3 × max clean reps' },
            { exerciseId: 'Mountain_Climbers', prescription: '4 × 40' },
            { exerciseId: 'Plank', prescription: '3 × 60 s' },
          ],
        },
      },
    },
    {
      day: 7,
      title: 'The hut at the col',
      weight: 'light',
      chapter:
        'A stone shelter with a tin roof and a visitors book going back forty years. You read it while your socks dry. Most entries are one line; a few are furious about the weather; one, from 1994, just says "worth it" with no explanation of what. Seven days. You are a quarter of the way up and the part everyone warns you about has not started. You sign the book.',
      movements: [
        { exerciseId: 'Walking_Treadmill', prescription: '25 min easy' },
        { exerciseId: 'Cat_Stretch', prescription: '3 × 10' },
        { exerciseId: 'Standing_Hip_Circles', prescription: '2 × 12 per side' },
        { exerciseId: 'Butt_Lift_Bridge', prescription: '3 × 15' },
      ],
      ecNote: 'Write your own line in the book: what this week actually cost you.',
    },
  ],
}
