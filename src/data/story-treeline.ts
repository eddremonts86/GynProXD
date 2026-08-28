import type { StoryProgram } from '../lib/story'

/**
 * Above the Treeline — original content, written for enForma. Thirty days
 * walking up out of a valley, all of them written. Deliberately not a
 * fantasy quest: the effort in the story is the effort in the gym, which is
 * what makes the framing hold instead of feeling pasted on.
 *
 * Rotation, not rest: a heavy day is always followed by a light one, so the
 * streak survives the week. Movement ids reference the bundled catalogue.
 */
export const ABOVE_THE_TREELINE: StoryProgram = {
  id: 'story-above-the-treeline',
  name: 'Above the Treeline',
  tagline: 'Thirty days out of the valley, one chapter at a time.',
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
    {
      day: 8,
      title: 'Moraine',
      weight: 'moderate',
      chapter:
        'Above the col the ground stops being ground. A moraine is what a glacier leaves behind when it retreats: a field of loose rock the size of televisions, none of it settled, all of it willing to move under a boot. There is no path because a path would not survive the winter. You pick a line and you commit to each stone for the half second you are standing on it.',
      movements: [
        { exerciseId: 'Dumbbell_Step_Ups', prescription: '4 × 12 per leg' },
        { exerciseId: 'Bodyweight_Walking_Lunge', prescription: '3 × 12 per leg' },
        { exerciseId: 'Standing_Calf_Raises', prescription: '4 × 20' },
        { exerciseId: 'Plank', prescription: '3 × 50 s' },
      ],
      byTrack: {
        line: {
          chapter:
            'Above the col the ground stops being ground. You are out front on the moraine, which means you are the one who finds out which stones move. Twice today a fridge-sized block shifted under you and you were already stepping off it. Nobody thanked you. That is the job.',
          movements: [
            { exerciseId: 'Bodyweight_Walking_Lunge', prescription: '4 × 12 per leg, slow and controlled' },
            { exerciseId: 'Plank', prescription: '4 × 50 s' },
            { exerciseId: 'Russian_Twist', prescription: '3 × 24' },
            { exerciseId: 'Standing_Calf_Raises', prescription: '3 × 20' },
          ],
        },
      },
    },
    {
      day: 9,
      title: 'Two thousand four hundred',
      weight: 'heavy',
      chapter:
        'The number on the altimeter is the only thing that changes quickly. Everything else — the light, the rock, the sound of your own breathing — settles into a version of itself that will last for weeks. Today is the first day the climbing is genuinely steep, and the first day you understand that fitness at sea level and fitness here are different currencies with a bad exchange rate.',
      movements: [
        { exerciseId: 'Barbell_Squat', prescription: '5 × 8' },
        { exerciseId: 'Dumbbell_Step_Ups', prescription: '4 × 12 per leg' },
        { exerciseId: 'Farmers_Walk', prescription: '3 × 40 m' },
        { exerciseId: 'Sit-Up', prescription: '3 × 25' },
      ],
      ecNote: 'One more set of squats at the same weight. The mountain does not negotiate either.',
      byTrack: {
        pace: {
          movements: [
            { exerciseId: 'Rowing_Stationary', prescription: '20 min, hard' },
            { exerciseId: 'Bodyweight_Squat', prescription: '4 × 25' },
            { exerciseId: 'Mountain_Climbers', prescription: '4 × 50' },
            { exerciseId: 'Sit-Up', prescription: '3 × 25' },
          ],
        },
      },
    },
    {
      day: 10,
      title: 'Water',
      weight: 'light',
      chapter:
        'Melt runs off the glacier all afternoon and stops at dusk when the temperature drops, which means the day is organised around filling bottles between two and six. It is a strange kind of rest: nothing to climb, everything to carry. Somebody works out that the group is drinking twenty-two litres a day and that all of it has to be moved uphill by hand.',
      movements: [
        { exerciseId: 'Farmers_Walk', prescription: '4 × 30 m, moderate' },
        { exerciseId: 'Cat_Stretch', prescription: '3 × 10' },
        { exerciseId: 'Standing_Hip_Flexors', prescription: '2 × 30 s per side' },
      ],
    },
    {
      day: 11,
      title: 'The ice fall',
      weight: 'moderate',
      chapter:
        'A frozen waterfall blocks the gully, forty metres of blue-white ice that goes from vertical to overhanging at the top. You do not climb it — nobody in this group is climbing that — but the detour around it costs three hours and eight hundred metres of ground you have to gain twice. You stand under it for a minute first. It makes a noise like a building settling.',
      movements: [
        { exerciseId: 'Pushups', prescription: '4 × max clean reps' },
        { exerciseId: 'Seated_Cable_Rows', prescription: '4 × 12' },
        { exerciseId: 'Bench_Dips', prescription: '3 × 15' },
        { exerciseId: 'Face_Pull', prescription: '3 × 15' },
      ],
    },
    {
      day: 12,
      title: 'Everything twice',
      weight: 'heavy',
      chapter:
        'Load carrying: the section above camp is too steep to do in one trip with full packs, so you do it in two. Up with half the gear, down empty, up again. The second climb is not half as hard as the first, it is harder, and everybody knows the arithmetic before they start. You do it anyway because the alternative is not going up.',
      movements: [
        { exerciseId: 'Barbell_Deadlift', prescription: '5 × 5' },
        { exerciseId: 'Farmers_Walk', prescription: '5 × 40 m, heavy' },
        { exerciseId: 'Barbell_Shrug', prescription: '3 × 15' },
        { exerciseId: 'Plank', prescription: '3 × 60 s' },
      ],
      ecNote: 'Do the last farmer’s walk twice. That is what "everything twice" means.',
      byTrack: {
        line: {
          movements: [
            { exerciseId: 'Barbell_Deadlift', prescription: '5 × 5, slow eccentric' },
            { exerciseId: 'Push_Up_to_Side_Plank', prescription: '4 × 10 per side' },
            { exerciseId: 'Russian_Twist', prescription: '4 × 24' },
            { exerciseId: 'Plank', prescription: '4 × 60 s' },
          ],
        },
      },
    },
    {
      day: 13,
      title: 'Rest is a verb here',
      weight: 'light',
      chapter:
        'Nobody moves camp. This is not a day off — there is no such thing at altitude, where sitting still is how you acclimatise and acclimatising is work your body does whether you approve of it or not. You sort gear. You dry socks on hot rock. You sleep badly at three thousand metres and wake up slightly better adapted than you were.',
      movements: [
        { exerciseId: 'Walking_Treadmill', prescription: '25 min very easy' },
        { exerciseId: 'Cat_Stretch', prescription: '3 × 10' },
        { exerciseId: 'Seated_Overhead_Stretch', prescription: '3 × 30 s' },
        { exerciseId: 'Standing_Hip_Circles', prescription: '2 × 12 per side' },
      ],
    },
    {
      day: 14,
      title: 'Two weeks',
      weight: 'moderate',
      chapter:
        'Halfway by days, not by height — the second half of a mountain is always more than half the work. Two weeks in, the group has sorted itself into people who talk in the morning and people who do not, and everyone has stopped pretending otherwise. Your hands have changed. Somebody points out that none of you have seen a road since the first day.',
      movements: [
        { exerciseId: 'Bodyweight_Squat', prescription: '4 × 20' },
        { exerciseId: 'Pushups', prescription: '4 × max clean reps' },
        { exerciseId: 'Seated_Cable_Rows', prescription: '4 × 12' },
        { exerciseId: 'Sit-Up', prescription: '3 × 25' },
      ],
    },
    {
      day: 15,
      title: 'The headwall',
      weight: 'heavy',
      chapter:
        'Six hundred metres of steep, unbroken ground between you and the upper basin, and no way to break it into pieces because there is nowhere flat enough to stop. You go up it in one push, which takes most of the day and all of the conversation. At the top, the basin opens out and the summit is visible for the first time since the valley. It looks close. It is eleven days away.',
      movements: [
        { exerciseId: 'Front_Barbell_Squat', prescription: '5 × 6' },
        { exerciseId: 'Dumbbell_Step_Ups', prescription: '5 × 12 per leg' },
        { exerciseId: 'Mountain_Climbers', prescription: '4 × 50' },
        { exerciseId: 'Standing_Calf_Raises', prescription: '4 × 25' },
      ],
      ecNote: 'No sitting between step-up sets. The headwall had nowhere to sit.',
      byTrack: {
        load: {
          movements: [
            { exerciseId: 'Front_Barbell_Squat', prescription: '5 × 6, heavy' },
            { exerciseId: 'Farmers_Walk', prescription: '5 × 40 m, heavy' },
            { exerciseId: 'Dumbbell_Step_Ups', prescription: '4 × 12 per leg' },
            { exerciseId: 'Barbell_Shrug', prescription: '3 × 15' },
          ],
        },
      },
    },
    {
      day: 16,
      title: 'Snow blindness',
      weight: 'light',
      chapter:
        'One of the group loses their glasses in the morning and says nothing about it until the afternoon, by which point the damage is done: eyes streaming, everything a white blur, a headache like a vice. It is entirely preventable and it happens on expeditions every year. Camp stays where it is. You lead them by the elbow to the tent.',
      movements: [
        { exerciseId: 'Isometric_Neck_Exercise_-_Sides', prescription: '2 × 20 s per side' },
        { exerciseId: 'Cat_Stretch', prescription: '3 × 10' },
        { exerciseId: 'Butt_Lift_Bridge', prescription: '3 × 15' },
        { exerciseId: 'Superman', prescription: '3 × 12' },
      ],
    },
    {
      day: 17,
      title: 'Crevasse field',
      weight: 'moderate',
      chapter:
        'Roped together for the first time, three metres apart, walking across a glacier that has cracks in it you can see and cracks in it you cannot. The ones you cannot see are the point of the rope. You probe ahead with a pole and step where you are told to step, and the whole thing is slow and tedious and absolutely not the moment to get bored.',
      movements: [
        { exerciseId: 'Bodyweight_Walking_Lunge', prescription: '4 × 12 per leg, deliberate' },
        { exerciseId: 'Plank', prescription: '4 × 60 s' },
        { exerciseId: 'Russian_Twist', prescription: '3 × 24' },
        { exerciseId: 'Bent-Knee_Hip_Raise', prescription: '3 × 15' },
      ],
      byTrack: {
        line: {
          chapter:
            'Roped together for the first time, and you are on the sharp end — first on the rope, probing ahead, deciding for four people where the next step goes. Every crossing is a judgement you make and they trust. It is the least physical day of the climb and you finish it more tired than the headwall.',
        },
      },
    },
    {
      day: 18,
      title: 'The turn-back',
      weight: 'heavy',
      chapter:
        'One of you is not going up. It is the right call and it is made calmly over breakfast, and it is still the worst morning of the trip: a persistent cough that started on day fourteen and has not improved, at an altitude where nothing improves. Two go down with them to the col and come back up the same day, which is a brutal piece of work nobody complains about. Four go on.',
      movements: [
        { exerciseId: 'Barbell_Deadlift', prescription: '5 × 5' },
        { exerciseId: 'Dumbbell_Step_Ups', prescription: '5 × 12 per leg' },
        { exerciseId: 'Farmers_Walk', prescription: '4 × 40 m' },
        { exerciseId: 'Push_Up_to_Side_Plank', prescription: '3 × 10 per side' },
      ],
      ecNote: 'Add the descent: 20 slow, controlled step-downs per leg. Going down costs too.',
    },
    {
      day: 19,
      title: 'Quiet camp',
      weight: 'light',
      chapter:
        'Four people and a lot of unused gear. The tents that were tight are now roomy, which is worse. You redistribute the loads, which means everyone is carrying more from here, and nobody says the obvious thing about how much simpler the arithmetic has become. Easy day. Take it seriously — the next section does not allow for tired legs.',
      movements: [
        { exerciseId: 'Walking_Treadmill', prescription: '20 min easy' },
        { exerciseId: 'Standing_Hip_Flexors', prescription: '3 × 30 s per side' },
        { exerciseId: 'Cat_Stretch', prescription: '3 × 10' },
      ],
    },
    {
      day: 20,
      title: 'Pinned',
      weight: 'light',
      chapter:
        'The storm arrives at two in the morning and does not leave for thirty hours. You lie in a tent listening to fabric that is doing a job it was designed for and sounds like it is not. There is nothing to do and nothing to decide, and both of those turn out to be harder than climbing. Someone starts reading the stove instructions aloud for something to say.',
      movements: [
        { exerciseId: 'Plank', prescription: '4 × 45 s' },
        { exerciseId: 'Superman', prescription: '3 × 15' },
        { exerciseId: 'Butt_Lift_Bridge', prescription: '3 × 20' },
        { exerciseId: 'Cat_Stretch', prescription: '3 × 10' },
      ],
      ecNote: 'Everything today in the space of one tent: no walking about between sets.',
    },
    {
      day: 21,
      title: 'Digging out',
      weight: 'moderate',
      chapter:
        'A metre of new snow and a camp that has to be excavated before it can be moved. Three hours of shovelling at four thousand metres, which is its own event and would be a full day at sea level. The sky is the kind of blue that only follows a bad storm, and everything is beautiful and nothing is convenient.',
      movements: [
        { exerciseId: 'One-Arm_Kettlebell_Swings', prescription: '4 × 15 per side' },
        { exerciseId: 'Good_Morning', prescription: '3 × 12' },
        { exerciseId: 'Russian_Twist', prescription: '4 × 24' },
        { exerciseId: 'Bent-Knee_Hip_Raise', prescription: '3 × 15' },
      ],
    },
    {
      day: 22,
      title: 'High camp',
      weight: 'heavy',
      chapter:
        'The last camp you will build. Above this there is nothing flat, nothing sheltered, and no water that is not snow you melt yourself. Getting the gear up here takes everything the day has, and then you spend an hour cutting a platform out of the slope because a tent needs level ground and the mountain does not provide any.',
      movements: [
        { exerciseId: 'Barbell_Squat', prescription: '5 × 8' },
        { exerciseId: 'Farmers_Walk', prescription: '5 × 40 m, heavy' },
        { exerciseId: 'One-Arm_Kettlebell_Swings', prescription: '4 × 15 per side' },
        { exerciseId: 'Plank', prescription: '3 × 60 s' },
      ],
      ecNote: 'Cut the platform: 3 × 20 kettlebell swings after everything else.',
      byTrack: {
        pace: {
          movements: [
            { exerciseId: 'Rowing_Stationary', prescription: '20 min hard' },
            { exerciseId: 'Bodyweight_Squat', prescription: '5 × 25' },
            { exerciseId: 'Mountain_Climbers', prescription: '5 × 50' },
            { exerciseId: 'Plank', prescription: '3 × 60 s' },
          ],
        },
      },
    },
    {
      day: 23,
      title: 'Melting snow',
      weight: 'light',
      chapter:
        'It takes four hours to make eight litres of water from snow, and someone has to sit with the stove the whole time because it cannot be left. You take the shift after dinner and watch the light go off the summit ridge, which happens quickly and then keeps happening for a long time afterwards. This is the last easy evening.',
      movements: [
        { exerciseId: 'Seated_Overhead_Stretch', prescription: '3 × 30 s' },
        { exerciseId: 'Standing_Hip_Circles', prescription: '3 × 12 per side' },
        { exerciseId: 'Cat_Stretch', prescription: '3 × 10' },
        { exerciseId: 'Butt_Lift_Bridge', prescription: '2 × 20' },
      ],
    },
    {
      day: 24,
      title: 'Fixing the line',
      weight: 'moderate',
      chapter:
        'The summit ridge needs rope on it before anyone goes up in the dark, so today you climb two thirds of the route, fix the line, and come back down to sleep. It is the strangest kind of effort: real climbing, all of it given back at the end of the day. The rope stays. That is the whole point.',
      movements: [
        { exerciseId: 'Seated_Cable_Rows', prescription: '4 × 12' },
        { exerciseId: 'Pushups', prescription: '4 × max clean reps' },
        { exerciseId: 'Face_Pull', prescription: '3 × 15' },
        { exerciseId: 'Bench_Dips', prescription: '3 × 15' },
      ],
      byTrack: {
        line: {
          chapter:
            'The summit ridge needs rope on it, and fixing it is your job from the first metre to the last. Six hours of placing gear on ground that will be crossed in the dark by people trusting your judgement, and then you walk down from all of it and sleep. Tomorrow they clip into what you built.',
          movements: [
            { exerciseId: 'Seated_Cable_Rows', prescription: '5 × 12' },
            { exerciseId: 'Push_Up_to_Side_Plank', prescription: '4 × 10 per side' },
            { exerciseId: 'Face_Pull', prescription: '4 × 15' },
            { exerciseId: 'Plank', prescription: '4 × 60 s' },
          ],
        },
      },
    },
    {
      day: 25,
      title: 'The false summit',
      weight: 'heavy',
      chapter:
        'You reach the top of the ridge and it is not the top. There is another one behind it, and from the map you already knew, and it does not help at all. This is the day that breaks people — not the hardest climbing, the most disappointing. You keep going for forty minutes past the point where it stopped feeling like a good idea, and then you turn around because the weather window is tomorrow, not today.',
      movements: [
        { exerciseId: 'Front_Barbell_Squat', prescription: '5 × 6' },
        { exerciseId: 'Dumbbell_Step_Ups', prescription: '5 × 14 per leg' },
        { exerciseId: 'Farmers_Walk', prescription: '4 × 40 m' },
        { exerciseId: 'Sit-Up', prescription: '4 × 25' },
      ],
      ecNote: 'One more set of step-ups after you have decided you are finished. That is the false summit.',
    },
    {
      day: 26,
      title: 'Waiting for the window',
      weight: 'light',
      chapter:
        'The forecast says a thirty-six hour gap starting tomorrow at four in the morning. Everything today is preparation and nothing today is progress: gear laid out, ropes coiled, boots dried, a meal eaten at five in the afternoon because you will be walking at four. Nobody sleeps much. That is fine and it is expected.',
      movements: [
        { exerciseId: 'Walking_Treadmill', prescription: '20 min very easy' },
        { exerciseId: 'Cat_Stretch', prescription: '3 × 10' },
        { exerciseId: 'Standing_Hip_Flexors', prescription: '3 × 30 s per side' },
      ],
    },
    {
      day: 27,
      title: 'Four in the morning',
      weight: 'moderate',
      chapter:
        'Head torches and the sound of four people breathing. The cold is a specific, personal insult at this hour and the first hour of any summit day is the one where everyone privately considers going back to bed. Then it gets light, and the light comes from below the horizon and hits the ridge above you before it hits anything else, and nobody considers going back to bed again.',
      movements: [
        { exerciseId: 'Bodyweight_Squat', prescription: '4 × 20' },
        { exerciseId: 'Mountain_Climbers', prescription: '4 × 40' },
        { exerciseId: 'Plank', prescription: '4 × 60 s' },
        { exerciseId: 'Standing_Calf_Raises', prescription: '4 × 25' },
      ],
    },
    {
      day: 28,
      title: 'The last steep',
      weight: 'heavy',
      chapter:
        'Two hundred metres of the hardest ground on the mountain, on the fixed rope, one person at a time. You count breaths per step because there is no longer enough air to do it any other way: three breaths, one step, three breaths. It takes four hours to climb what would be a twenty minute walk at home, and every metre of it is yours.',
      movements: [
        { exerciseId: 'Barbell_Deadlift', prescription: '5 × 5' },
        { exerciseId: 'Dumbbell_Step_Ups', prescription: '5 × 15 per leg' },
        { exerciseId: 'Seated_Cable_Rows', prescription: '4 × 12' },
        { exerciseId: 'Plank', prescription: '4 × 60 s' },
      ],
      ecNote: 'Three breaths, one rep. Do the last set of step-ups at that pace and no faster.',
      byTrack: {
        load: {
          movements: [
            { exerciseId: 'Barbell_Deadlift', prescription: '5 × 5, heavy' },
            { exerciseId: 'Farmers_Walk', prescription: '6 × 40 m, heaviest of the climb' },
            { exerciseId: 'Dumbbell_Step_Ups', prescription: '4 × 15 per leg' },
            { exerciseId: 'Barbell_Shrug', prescription: '3 × 15' },
          ],
        },
      },
    },
    {
      day: 29,
      title: 'Camp below the top',
      weight: 'light',
      chapter:
        'Close enough to see it and not close enough to touch it. You sleep — or lie down, at any rate — a few hundred metres below the summit, which is the most uncomfortable night of the expedition and the shortest. Everything is packed. Everything is decided. Tomorrow is thirty days of walking arriving somewhere.',
      movements: [
        { exerciseId: 'Cat_Stretch', prescription: '3 × 10' },
        { exerciseId: 'Standing_Hip_Circles', prescription: '3 × 12 per side' },
        { exerciseId: 'Seated_Overhead_Stretch', prescription: '3 × 30 s' },
      ],
    },
    {
      day: 30,
      title: 'Above the treeline',
      weight: 'heavy',
      chapter:
        'It is a rounded dome of old snow with a metal post in it, and it is not dramatic, and you stand on it for eleven minutes because that is all the weather gives you. From up here the valley where the road ended is a green line so far below it looks like a rumour. You did not conquer anything: the mountain is exactly as it was and will outlast everyone who has ever stood here. What changed is the person who walked out of that turning circle thirty days ago. Then you turn around, because the summit is only half of it, and going down is how people get hurt.',
      movements: [
        { exerciseId: 'Barbell_Squat', prescription: '5 × 8' },
        { exerciseId: 'Farmers_Walk', prescription: '5 × 40 m' },
        { exerciseId: 'Dumbbell_Step_Ups', prescription: '5 × 15 per leg' },
        { exerciseId: 'Pushups', prescription: '4 × max clean reps' },
        { exerciseId: 'Plank', prescription: '4 × 60 s' },
      ],
      ecNote: 'The descent: 30 controlled step-downs per leg. Thirty days, thirty reps, and then it is done.',
    },
  ],
}
