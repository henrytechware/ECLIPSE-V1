'use strict';

const path = require('path');
const fs = require('fs');

const formatter = require('../utils/formatter');
const { getJson } = require('../utils/downloader');
const wcg = require('../games/wcg');

const RIDDLES = require('../data/riddles');
const TRUTHS = require('../data/truths');
const DARES = require('../data/dares');
const FACTS = require('../data/facts');
const MEMES = require('../data/memes');

/* ------------------------------- local data ------------------------------- */

const INSULTS = [
  'You have the confidence of a genius and the evidence of a loading screen.',
  'Your argument has more holes than a broken umbrella.',
  'You bring absolutely nothing to the table except unnecessary confidence.',
  'You are proof that volume and intelligence are completely unrelated.',
  'Your logic took a vacation and forgot to come back.',
  'You have mastered the art of being confidently incorrect.',
  'If common sense were currency, you would be bankrupt.',
  'Your thoughts seem to arrive with a significant delay.',
  'You are the human equivalent of a typo.',
  'Your explanation somehow made the original problem more intelligent.',
  'You have an impressive ability to miss the point repeatedly.',
  'Your confidence is doing overtime for your reasoning.',
  'You make simple things complicated with remarkable consistency.',
  'Your train of thought appears to have missed the station.',
  'You argue like facts are optional decorations.',
  'Your logic needs a software update.',
  'You have the strategic thinking of a coin toss.',
  'Your attention span is shorter than your list of excuses.',
  'You could lose an argument with a mirror.',
  'Your reasoning has more plot holes than a bad movie.',
  'You are remarkably committed to misunderstanding everything.',
  'Your brain seems to operate on airplane mode.',
  'You have mistaken confidence for competence again.',
  'Your conclusions arrive long before your evidence.',
  'You are not wrong by accident; you are wrong with dedication.',
  'Your ideas need supervision.',
  'You have a talent for making silence seem intelligent.',
  'Your explanation needs an explanation.',
  'You bring chaos to conversations that were perfectly peaceful.',
  'You could turn a straight line into a complicated detour.',
  'Your logic is running on low battery.',
  'You have the rare ability to make obvious things sound mysterious.',
  'Your argument is impressive if the goal was to avoid the point.',
  'You are living proof that confidence can survive without evidence.',
  'Your reasoning needs a map.',
  'You have a remarkable talent for choosing the least logical option.',
  'Your brain appears to be buffering.',
  'You speak with the certainty of someone who skipped the research.',
  'Your ideas have potential; unfortunately, none of them are using it.',
  'You are an excellent example of why instructions come with examples.',
  'Your logic just filed for early retirement.',
  'You make guessing sound like a professional skill.',
  'Your opinions arrive dressed as facts.',
  'You have the precision of a broken compass.',
  'You could complicate a two-piece puzzle.',
  'Your reasoning has entered unexplored territory.',
  'You are remarkably efficient at wasting perfectly good arguments.',
  'Your facts seem to come from the imagination department.',
  'You have the confidence of someone who has never met a fact.',
  'Your brain has apparently chosen creative writing over reality.',
  'You make wrong answers sound professionally prepared.',
  'Your argument is like a Wi-Fi signal in a basement: weak and unreliable.',
  'You have turned misunderstanding into an art form.',
  'Your reasoning deserves a participation trophy.',
  'You are somehow both loud and unclear.',
  'Your thoughts seem to have no central management.',
  'You could make a dictionary feel confused.',
  'Your argument needs more than confidence; it needs evidence.',
  'You have the intellectual GPS of someone driving with the screen off.',
  'You are proof that not every thought needs to become a sentence.',
  'Your logic is impressive in the same way a traffic jam is impressive.',
  'You have a fascinating relationship with facts: mostly long-distance.',
  'Your brain appears to be negotiating with reality.',
  'You make overthinking look underqualified.',
  'Your argument arrived without its supporting documents.',
  'You have the consistency of a broken clock with no battery.',
  'You could misunderstand a neon sign.',
  'Your logic is taking the scenic route to nowhere.',
  'You bring a lot of certainty to very little information.',
  'Your reasoning has more detours than a road under construction.',
  'You have made being incorrect look like a full-time profession.',
  'Your ideas need quality control.',
  'You have the timing of a delayed notification.',
  'Your argument is held together by optimism.',
  'You could turn a simple question into a three-hour investigation.',
  'Your brain appears to be running experimental software.',
  'You have an impressive collection of conclusions without evidence.',
  'You make confusion look intentional.',
  'Your logic has left the chat.',
  'You have somehow made common sense uncommon.',
  'Your argument needs a second opinion from reality.',
  'You are extraordinarily confident for someone improvising.',
  'Your reasoning sounds like a draft that was never proofread.',
  'You could get lost in a one-page instruction manual.',
  'Your ideas have buffering issues.',
  'You make certainty look suspicious.',
  'Your argument has the structural integrity of wet cardboard.',
  'You have the unique talent of being confidently irrelevant.',
  'Your reasoning is like a puzzle missing half the pieces.',
  'You have managed to turn a discussion into a guessing game.',
  'Your facts need fact-checking.',
  'You argue like the dictionary personally offended you.',
  'Your logic needs customer support.',
  'You have impressive confidence in questionable decisions.',
  'Your argument is a masterpiece of unnecessary complications.',
  'You have somehow made silence sound like the better argument.',
  'Your reasoning deserves a loading icon.',
  'You are exceptionally talented at missing obvious clues.',
  'Your argument is not deep; it is simply lost.',
  'You have the intellectual traction of a car stuck in mud.',
  'Your logic has potential, but it forgot to show up.'
];

const QUOTES = [
  { q: "The future belongs to those who prepare for it today.", a: "Unknown" },
  { q: "Small steps still move you forward.", a: "Unknown" },
  { q: "Your mindset can turn obstacles into opportunities.", a: "Unknown" },
  { q: "Success begins where excuses end.", a: "Unknown" },
  { q: "Be patient with yourself; growth takes time.", a: "Unknown" },
  { q: "A quiet mind can hear what noise hides.", a: "Unknown" },
  { q: "Consistency can accomplish what motivation cannot.", a: "Unknown" },
  { q: "Every day is another chance to improve.", a: "Unknown" },
  { q: "Your choices shape the person you become.", a: "Unknown" },
  { q: "Difficult roads often teach the best lessons.", a: "Unknown" },
  { q: "Confidence grows when you keep promises to yourself.", a: "Unknown" },
  { q: "Don't fear starting small; fear never starting.", a: "Unknown" },
  { q: "The strongest foundations are built slowly.", a: "Unknown" },
  { q: "You cannot change yesterday, but you can influence tomorrow.", a: "Unknown" },
  { q: "Progress is still progress when nobody notices.", a: "Unknown" },
  { q: "Protect your peace as carefully as your goals.", a: "Unknown" },
  { q: "A setback is information, not a verdict.", a: "Unknown" },
  { q: "Dreams become plans when you give them deadlines.", a: "Unknown" },
  { q: "Your effort matters even before the results appear.", a: "Unknown" },
  { q: "Learn to enjoy the journey, not only the destination.", a: "Unknown" },

  { q: "Discipline creates freedom where excuses create limits.", a: "Unknown" },
  { q: "The person you become is built by what you repeatedly do.", a: "Unknown" },
  { q: "Hard seasons can produce strong roots.", a: "Unknown" },
  { q: "Never underestimate what one focused year can change.", a: "Unknown" },
  { q: "Your attention is one of your most valuable resources.", a: "Unknown" },
  { q: "Courage is moving forward while uncertainty walks beside you.", a: "Unknown" },
  { q: "The best investment is becoming better at being yourself.", a: "Unknown" },
  { q: "A mistake becomes wisdom when you learn from it.", a: "Unknown" },
  { q: "Patience is strength wearing a quiet disguise.", a: "Unknown" },
  { q: "You don't need permission to improve your life.", a: "Unknown" },
  { q: "Great things often begin with uncomfortable decisions.", a: "Unknown" },
  { q: "Focus on what you can control and release the rest.", a: "Unknown" },
  { q: "Your habits are votes for the person you want to become.", a: "Unknown" },
  { q: "The beginning may be messy; begin anyway.", a: "Unknown" },
  { q: "A clear purpose makes difficult choices easier.", a: "Unknown" },
  { q: "Don't let temporary problems create permanent doubt.", a: "Unknown" },
  { q: "Growth requires leaving comfortable places.", a: "Unknown" },
  { q: "Your potential expands when you challenge your limits.", a: "Unknown" },
  { q: "Sometimes the bravest move is simply trying again.", a: "Unknown" },
  { q: "You become stronger every time you refuse to quit.", a: "Unknown" },

  { q: "Success is built in ordinary moments.", a: "Unknown" },
  { q: "The hardest part is often taking the first step.", a: "Unknown" },
  { q: "Don't compare your beginning with someone else's middle.", a: "Unknown" },
  { q: "Peace is worth more than winning every argument.", a: "Unknown" },
  { q: "A focused hour can change the direction of a day.", a: "Unknown" },
  { q: "What you practice becomes what you perform.", a: "Unknown" },
  { q: "Your future self is depending on today's decisions.", a: "Unknown" },
  { q: "Failure is not falling; failure is refusing to rise.", a: "Unknown" },
  { q: "The strongest people know when to ask for help.", a: "Unknown" },
  { q: "Keep going; progress often hides before it appears.", a: "Unknown" },
  { q: "A calm response can be more powerful than a loud reaction.", a: "Unknown" },
  { q: "Your words reveal what your heart carries.", a: "Unknown" },
  { q: "Character is revealed when nobody is watching.", a: "Unknown" },
  { q: "Be proud of how far you have survived.", a: "Unknown" },
  { q: "The right path may not be the easiest path.", a: "Unknown" },
  { q: "Time exposes what words try to hide.", a: "Unknown" },
  { q: "Choose people who make growth feel possible.", a: "Unknown" },
  { q: "A peaceful life is a successful life.", a: "Unknown" },
  { q: "Never trade your values for temporary approval.", a: "Unknown" },
  { q: "You can restart without returning to the beginning.", a: "Unknown" },

  { q: "Your story is still being written.", a: "Unknown" },
  { q: "Every ending creates space for something new.", a: "Unknown" },
  { q: "Sometimes losing direction is how you discover a better path.", a: "Unknown" },
  { q: "Don't allow one bad chapter to define your entire story.", a: "Unknown" },
  { q: "Healing is progress even when it feels slow.", a: "Unknown" },
  { q: "Some doors close because your future needs another entrance.", a: "Unknown" },
  { q: "Let your actions introduce you before your words do.", a: "Unknown" },
  { q: "A meaningful life is built from meaningful moments.", a: "Unknown" },
  { q: "You don't have to have everything figured out today.", a: "Unknown" },
  { q: "Sometimes clarity arrives after you stop forcing an answer.", a: "Unknown" },
  { q: "The people who doubt you can become reminders of your determination.", a: "Unknown" },
  { q: "Never let someone else's limitations become your beliefs.", a: "Unknown" },
  { q: "Your worth does not decrease because someone failed to recognize it.", a: "Unknown" },
  { q: "Keep your heart kind without making your boundaries weak.", a: "Unknown" },
  { q: "The right people won't require you to become someone else.", a: "Unknown" },
  { q: "A mature mind knows that silence can be an answer.", a: "Unknown" },
  { q: "Not every battle deserves your energy.", a: "Unknown" },
  { q: "Walking away can sometimes be an act of courage.", a: "Unknown" },
  { q: "You can forgive someone without giving them access again.", a: "Unknown" },
  { q: "Peace begins when you stop negotiating with chaos.", a: "Unknown" },

  { q: "Knowledge grows when curiosity refuses to sleep.", a: "Unknown" },
  { q: "The smartest person in the room is often the one willing to learn.", a: "Unknown" },
  { q: "Questions can open doors that answers cannot.", a: "Unknown" },
  { q: "Learning is the habit that keeps every other skill alive.", a: "Unknown" },
  { q: "An open mind can find lessons in unexpected places.", a: "Unknown" },
  { q: "Experience teaches what theory can only describe.", a: "Unknown" },
  { q: "Wisdom begins when certainty makes room for curiosity.", a: "Unknown" },
  { q: "Read widely, think deeply, and question respectfully.", a: "Unknown" },
  { q: "Every expert was once comfortable being a beginner.", a: "Unknown" },
  { q: "The more you learn, the more possibilities you can see.", a: "Unknown" },
  { q: "Curiosity turns ordinary moments into discoveries.", a: "Unknown" },
  { q: "A lesson repeated is a lesson remembered.", a: "Unknown" },
  { q: "Knowledge gives you options; wisdom teaches you when to use them.", a: "Unknown" },
  { q: "The best education changes how you think, not just what you know.", a: "Unknown" },
  { q: "Never stop asking why.", a: "Unknown" },
  { q: "Learning from others is one of the fastest ways to grow.", a: "Unknown" },
  { q: "A curious mind rarely runs out of doors to open.", a: "Unknown" },
  { q: "Understanding is more valuable than simply being right.", a: "Unknown" },
  { q: "The world rewards people who remain willing to learn.", a: "Unknown" },
  { q: "Wisdom is knowledge shaped by experience.", a: "Unknown" },

  { q: "Your greatest competition is the version of yourself you could become.", a: "Unknown" },
  { q: "Stop waiting for motivation and start building momentum.", a: "Unknown" },
  { q: "One disciplined decision can change an entire week.", a: "Unknown" },
  { q: "Action creates clarity faster than endless thinking.", a: "Unknown" },
  { q: "If it matters, give it your attention.", a: "Unknown" },
  { q: "A goal without action is only a wish with a deadline.", a: "Unknown" },
  { q: "Momentum begins with one completed task.", a: "Unknown" },
  { q: "Do what needs to be done before you feel ready.", a: "Unknown" },
  { q: "Your calendar reveals your priorities better than your words.", a: "Unknown" },
  { q: "Focus turns effort into results.", a: "Unknown" },
  { q: "Busy is not the same as productive.", a: "Unknown" },
  { q: "Finish what you start whenever you reasonably can.", a: "Unknown" },
  { q: "A plan gives your ambition a direction.", a: "Unknown" },
  { q: "Consistency makes ordinary effort extraordinary over time.", a: "Unknown" },
  { q: "Protect your mornings from unnecessary distractions.", a: "Unknown" },
  { q: "The work you avoid often contains the growth you need.", a: "Unknown" },
  { q: "Start before confidence arrives.", a: "Unknown" },
  { q: "Progress loves repetition.", a: "Unknown" },
  { q: "Your results eventually reflect your routines.", a: "Unknown" },
  { q: "Make today's effort worthy of tomorrow's gratitude.", a: "Unknown" },

  { q: "Kindness is strength without the need for applause.", a: "Unknown" },
  { q: "Treat people well even when there is nothing to gain.", a: "Unknown" },
  { q: "Respect is earned through consistency, not demanded through titles.", a: "Unknown" },
  { q: "Listen to understand, not merely to reply.", a: "Unknown" },
  { q: "A gentle word can change someone's entire day.", a: "Unknown" },
  { q: "Good character survives when circumstances change.", a: "Unknown" },
  { q: "The way you treat people says more than what you own.", a: "Unknown" },
  { q: "Be the reason someone believes people can still be good.", a: "Unknown" },
  { q: "Empathy is seeing another person's world without abandoning your own.", a: "Unknown" },
  { q: "Respect differences without losing your principles.", a: "Unknown" },
  { q: "A sincere apology can repair what pride would destroy.", a: "Unknown" },
  { q: "Good relationships are built through small acts of consideration.", a: "Unknown" },
  { q: "Speak honestly, but never forget to speak kindly.", a: "Unknown" },
  { q: "Trust grows slowly and disappears quickly.", a: "Unknown" },
  { q: "Loyalty is proven through actions during difficult moments.", a: "Unknown" },
  { q: "People remember how you made them feel long after conversations end.", a: "Unknown" },
  { q: "Boundaries protect relationships when expectations cannot.", a: "Unknown" },
  { q: "Choose honesty even when the truth is uncomfortable.", a: "Unknown" },
  { q: "A good friend celebrates your growth without feeling threatened by it.", a: "Unknown" },
  { q: "Compassion costs little but can mean everything.", a: "Unknown" },

  { q: "Life becomes lighter when you stop carrying what is not yours.", a: "Unknown" },
  { q: "Enjoy the moment you are living instead of rehearsing the next one.", a: "Unknown" },
  { q: "Happiness grows when gratitude becomes a habit.", a: "Unknown" },
  { q: "Simple moments often become the memories we value most.", a: "Unknown" },
  { q: "Don't postpone living while waiting for perfect circumstances.", a: "Unknown" },
  { q: "A grateful heart notices abundance where others see ordinary things.", a: "Unknown" },
  { q: "You don't need a perfect life to have meaningful days.", a: "Unknown" },
  { q: "Make room for laughter in serious seasons.", a: "Unknown" },
  { q: "Rest is part of progress, not the opposite of it.", a: "Unknown" },
  { q: "Sometimes the best plan is to slow down and breathe.", a: "Unknown" },
  { q: "Life is too valuable to spend entirely in comparison.", a: "Unknown" },
  { q: "Celebrate small victories; they build the larger ones.", a: "Unknown" },
  { q: "Gratitude turns what you have into enough.", a: "Unknown" },
  { q: "A peaceful afternoon can be more valuable than a busy achievement.", a: "Unknown" },
  { q: "Don't miss today's beauty while chasing tomorrow's promise.", a: "Unknown" },
  { q: "Make memories, not just schedules.", a: "Unknown" },
  { q: "The present moment is the only place life actually happens.", a: "Unknown" },
  { q: "Joy does not always need a reason.", a: "Unknown" },
  { q: "A balanced life leaves room for ambition and peace.", a: "Unknown" },
  { q: "Sometimes enough is more powerful than more.", a: "Unknown" },

  { q: "Courage is choosing action despite uncertainty.", a: "Unknown" },
  { q: "Fear becomes smaller when you stop feeding it with avoidance.", a: "Unknown" },
  { q: "You are capable of more than your worst day suggests.", a: "Unknown" },
  { q: "Bravery does not require the absence of fear.", a: "Unknown" },
  { q: "Stand firm when your values are being tested.", a: "Unknown" },
  { q: "The hardest decisions often reveal the clearest priorities.", a: "Unknown" },
  { q: "Don't let fear make decisions that your future must live with.", a: "Unknown" },
  { q: "Courage grows every time you face what you once avoided.", a: "Unknown" },
  { q: "Sometimes confidence is simply refusing to retreat.", a: "Unknown" },
  { q: "You can be afraid and still be determined.", a: "Unknown" },
  { q: "Strong people are not fearless; they are persistent.", a: "Unknown" },
  { q: "Take the risk that your future self will thank you for.", a: "Unknown" },
  { q: "Your comfort zone cannot teach you everything you need to know.", a: "Unknown" },
  { q: "Doubt is a question, not a conclusion.", a: "Unknown" },
  { q: "When the path is uncertain, let your principles be your compass.", a: "Unknown" },
  { q: "You don't need certainty to take the next step.", a: "Unknown" },
  { q: "Fear predicts possibilities; courage chooses among them.", a: "Unknown" },
  { q: "Every challenge you face expands your understanding of yourself.", a: "Unknown" },
  { q: "Strength is built by carrying what once felt impossible.", a: "Unknown" },
  { q: "Keep moving until the unknown becomes familiar.", a: "Unknown" },

  { q: "Your past explains you, but it does not have to define you.", a: "Unknown" },
  { q: "Forgive yourself for what you did not know back then.", a: "Unknown" },
  { q: "Healing takes patience because wounds rarely disappear on command.", a: "Unknown" },
  { q: "Some lessons arrive disguised as losses.", a: "Unknown" },
  { q: "You can miss the past without needing to return to it.", a: "Unknown" },
  { q: "Growth sometimes looks like becoming quieter, not louder.", a: "Unknown" },
  { q: "Let go of what repeatedly steals your peace.", a: "Unknown" },
  { q: "Not every goodbye is a tragedy.", a: "Unknown" },
  { q: "Closure sometimes comes from accepting that there will be no explanation.", a: "Unknown" },
  { q: "You are allowed to outgrow old versions of yourself.", a: "Unknown" },
  { q: "A new chapter requires the courage to turn the page.", a: "Unknown" },
  { q: "Healing is not forgetting; it is remembering without breaking.", a: "Unknown" },
  { q: "Your scars can become reminders of your resilience.", a: "Unknown" },
  { q: "Sometimes peace begins with accepting what cannot be changed.", a: "Unknown" },
  { q: "Don't confuse familiarity with destiny.", a: "Unknown" },
  { q: "The person you were deserves compassion from the person you are.", a: "Unknown" },
  { q: "Moving forward does not erase where you came from.", a: "Unknown" },
  { q: "You can rebuild without rebuilding the same life.", a: "Unknown" },
  { q: "Let your lessons stay even when you let the pain go.", a: "Unknown" },
  { q: "Tomorrow deserves a version of you that believes in possibility.", a: "Unknown" },

  { q: "Success without peace can become another form of failure.", a: "Unknown" },
  { q: "Build a life you do not constantly need to escape from.", a: "Unknown" },
  { q: "Money can buy options, but wisdom decides which options matter.", a: "Unknown" },
  { q: "Ambition is powerful when guided by purpose.", a: "Unknown" },
  { q: "A meaningful goal is worth more than an impressive appearance.", a: "Unknown" },
  { q: "Don't sacrifice your entire present for a future that is not guaranteed.", a: "Unknown" },
  { q: "The best success is becoming proud of the person you had to become.", a: "Unknown" },
  { q: "Achievement feels different when the journey has meaning.", a: "Unknown" },
  { q: "Build quietly and let your results introduce you.", a: "Unknown" },
  { q: "Your reputation is built one decision at a time.", a: "Unknown" },
  { q: "A meaningful life is measured in impact, not applause.", a: "Unknown" },
  { q: "Don't chase recognition so hard that you lose your identity.", a: "Unknown" },
  { q: "Success is more sustainable when your values can afford it.", a: "Unknown" },
  { q: "Create something your future self will be proud to inherit.", a: "Unknown" },
  { q: "The goal is not merely to arrive, but to become.", a: "Unknown" },
  { q: "Great results are usually ordinary habits repeated unusually long.", a: "Unknown" },
  { q: "Your legacy begins with what you do when nobody is keeping score.", a: "Unknown" },
  { q: "Let purpose be louder than pressure.", a: "Unknown" },
  { q: "A successful life has room for both achievement and humanity.", a: "Unknown" },
  { q: "Become valuable before becoming visible.", a: "Unknown" },

  { q: "Tomorrow is built from the decisions you make today.", a: "Unknown" },
  { q: "Keep your standards high and your ego low.", a: "Unknown" },
  { q: "The strongest foundation is self-respect.", a: "Unknown" },
  { q: "Never let temporary emotions make permanent decisions.", a: "Unknown" },
  { q: "Think long-term when short-term temptation gets loud.", a: "Unknown" },
  { q: "Your peace is not a reward; it is a responsibility.", a: "Unknown" },
  { q: "Choose progress over perfection.", a: "Unknown" },
  { q: "If you want different results, build different routines.", a: "Unknown" },
  { q: "Protect your energy from things that produce no value.", a: "Unknown" },
  { q: "Be selective with your attention; it becomes your life.", a: "Unknown" },
  { q: "A strong future requires uncomfortable discipline today.", a: "Unknown" },
  { q: "Don't let convenience become your compass.", a: "Unknown" },
  { q: "Your standards teach people how to treat your time.", a: "Unknown" },
  { q: "The life you want requires choices the old you would avoid.", a: "Unknown" },
  { q: "Keep learning, keep adapting, and keep moving.", a: "Unknown" },
  { q: "Your direction matters more than your current speed.", a: "Unknown" },
  { q: "Every day gives you another opportunity to write a better sentence in your story.", a: "Unknown" },
  { q: "Be disciplined enough to protect the dreams you are passionate about.", a: "Unknown" },
  { q: "A better life is usually built through better decisions, not better luck.", a: "Unknown" },
  { q: "Keep becoming someone your younger self would admire.", a: "Unknown" }
];

const ADVICE = [
  'Do the hardest task first; the rest of the day often feels easier afterward.',
  'Never make an important decision while extremely angry.',
  'Save part of every income before spending the rest.',
  'Protect your sleep because productivity without recovery eventually collapses.',
  'If a task takes less than two minutes, consider doing it immediately.',
  'Learn to say no without feeling obligated to provide a long explanation.',
  'Keep promises you make to yourself.',
  'Do not confuse being busy with being productive.',
  'Write important goals down instead of relying entirely on memory.',
  'Read something useful every day.',
  'Ask questions when you do not understand something.',
  'Do not let one bad day convince you that everything is going badly.',
  'Listen carefully before responding.',
  'Keep emergency savings whenever possible.',
  'Avoid making permanent decisions based on temporary emotions.',
  'Exercise regularly, even if the sessions are short.',
  'Drink enough water throughout the day.',
  'Keep your important files backed up.',
  'Use strong, unique passwords for important accounts.',
  'Turn on two-factor authentication where available.',
  'Do not share sensitive information with people you do not trust.',
  'Learn from criticism without automatically believing every criticism.',
  'Admit mistakes quickly and focus on fixing them.',
  'Do not waste energy trying to control what you cannot control.',
  'Spend more time with people who consistently respect you.',
  'Your reputation is built through repeated actions, not occasional promises.',
  'Compare yourself with your past performance rather than everyone around you.',
  'Take breaks before exhaustion forces you to stop.',
  'If you are confused, simplify the problem.',
  'When overwhelmed, identify the single most important next action.',
  'Do not postpone difficult conversations indefinitely.',
  'Think before sending messages when emotions are high.',
  'Keep your living and working spaces reasonably organized.',
  'Learn basic financial skills early.',
  'Do not spend money simply to impress other people.',
  'Invest in skills that remain useful over time.',
  'Practice explaining complicated ideas in simple language.',
  'If you want to remember something, write it down.',
  'Do not be afraid to start as a beginner.',
  'Consistency usually matters more than occasional bursts of motivation.',
  'Make your goals measurable whenever possible.',
  'Review your progress regularly.',
  'Do not let perfection prevent you from starting.',
  'Finish what genuinely matters before chasing distractions.',
  'Use your phone intentionally instead of automatically.',
  'Keep notifications limited to what you actually need.',
  'Learn how to use the tools you rely on every day.',
  'Treat strangers with basic respect.',
  'Be kind without allowing people to repeatedly exploit your kindness.',
  'Choose friends based on character rather than popularity.',
  'Do not gossip about people you would not confront directly.',
  'Keep private information private.',
  'When someone tells you a boundary, respect it.',
  'Do not expect people to read your mind.',
  'Communicate your expectations clearly.',
  'If you need help, ask for it early.',
  'Do not be embarrassed by honest questions.',
  'Learn to apologize without adding excuses.',
  'Forgive yourself for mistakes while still learning from them.',
  'Avoid repeatedly returning to situations that consistently harm your peace.',
  'Do not confuse familiarity with compatibility.',
  'Trust should be built gradually.',
  'Watch what people repeatedly do, not only what they promise.',
  'Take your time before trusting someone with important responsibilities.',
  'Do not sacrifice your long-term goals for temporary approval.',
  'Make decisions based on your values, not only on pressure.',
  'If something feels unnecessarily complicated, look for a simpler approach.',
  'Learn basic first aid and emergency procedures.',
  'Keep important contact information accessible.',
  'Have a plan for unexpected expenses.',
  'Read contracts before agreeing to them.',
  'Do not sign something you do not understand.',
  'Ask for clarification instead of pretending you understand.',
  'Keep records of important transactions and agreements.',
  'Learn from people who are better at something than you are.',
  'Teach others what you learn; teaching reinforces understanding.',
  'Do not let embarrassment stop you from correcting a mistake.',
  'Take calculated risks when the potential reward justifies them.',
  'Avoid unnecessary risks that could permanently damage your future.',
  'Use failure as information rather than as an identity.',
  'Do not let criticism from strangers define your self-worth.',
  'Celebrate progress even when the final goal is still far away.',
  'Spend time thinking without constant entertainment.',
  'Give yourself permission to change your mind when new evidence appears.',
  'Separate facts from assumptions before making serious decisions.',
  'When arguing, focus on solving the problem rather than winning.',
  'Do not respond to every provocation.',
  'Silence can be more effective than a pointless argument.',
  'If you make a mistake, correct it instead of hiding it.',
  'Keep learning even after you become good at something.',
  'Take care of your body before it forces you to.',
  'Protect your mental space from unnecessary negativity.',
  'Build routines that make good decisions easier.',
  'Use deadlines to prevent important tasks from remaining permanently unfinished.',
  'Do not underestimate the value of patience.',
  'Think long-term when making decisions that affect your future.',
  'Be disciplined when motivation disappears.',
  'Leave room in your plans for unexpected problems.',
  'Remember that progress does not have to be perfect to be real.'
];

const PICKUP_LINES = [
  'Are you Wi-Fi? Because I am feeling a connection.',
  'Is your name Google? Because you have everything I have been searching for.',
  'Are you a magician? Because whenever you are around, everyone else disappears.',
  'Do you have a map? I keep getting lost in your eyes.',
  'Are you made of copper and tellurium? Because you are Cu-Te.',
  'If beauty were time, you would be an eternity.',
  'Are you a keyboard? Because you are just my type.',
  'Do you believe in love at first sight, or should I walk by again?',
  'Are you a camera? Because every time I see you, I smile.',
  'You must be tired because you have been running through my mind all day.',
  'Is there a spark between us, or is my phone just charging?',
  'Are you a parking ticket? Because you have got FINE written all over you.',
  'If you were a vegetable, you would be a cute-cumber.',
  'Are you sunshine? Because you just brightened my day.',
  'You must be a star because your presence lights up the room.',
  'Is your name Lucky? Because meeting you feels like my lucky day.',
  'Are you an equation? Because you are the solution to everything.',
  'Do you have a Band-Aid? I scraped my knee falling for you.',
  'If you were a song, you would be my favorite track.',
  'Are you gravity? Because I keep falling for you.',
  'You must be a notification because I always hope to see you.',
  'Are you a bookmark? Because I want to save this moment.',
  'If smiles were currency, you would be priceless.',
  'Are you a sunset? Because I could stare at you forever.',
  'You must be made of stardust because you are out of this world.',
  'Are you a charger? Because you give me energy.',
  'Is your name Melody? Because you make everything sound better.',
  'Are you a dictionary? Because you add meaning to my life.',
  'If kindness were a superpower, you would be unstoppable.',
  'Are you a lighthouse? Because you caught my attention from afar.',
  'You are like my favorite notification: unexpected but always welcome.',
  'Are you coffee? Because you make my mornings better.',
  'Is your name Autumn? Because you make everything feel warm.',
  'Are you a puzzle? Because I would love to figure you out.',
  'You must be a dream because meeting you feels unreal.',
  'Are you a compass? Because you point me in the right direction.',
  'If compliments were stars, I would need the whole galaxy.',
  'Are you an artist? Because you just painted a smile on my face.',
  'You must be a bookmark because I want to keep coming back to you.',
  'Are you a planet? Because my world seems to revolve around you.',
  'If laughter were medicine, you would be my favorite prescription.',
  'Are you a sunrise? Because you make everything look better.',
  'You have the kind of smile that deserves its own spotlight.',
  'Are you a password? Because I cannot stop thinking about you.',
  'You must be a notification because my heart reacts whenever you appear.',
  'Are you a library book? Because I could spend hours getting to know you.',
  'If charm were a currency, you would be extremely wealthy.',
  'Are you a constellation? Because I keep finding reasons to look your way.',
  'You are proof that good surprises still exist.',
  'Are you a magnet? Because I keep getting drawn toward you.',
  'If personality were music, yours would be stuck in my head.',
  'Are you a favorite song? Because I never get tired of you.',
  'You must be a rare collectible because there is nobody quite like you.',
  'Are you a candle? Because you make everything feel warmer.',
  'If happiness had a face, I think it would look like yours.',
  'Are you a fresh playlist? Because I want to discover everything about you.',
  'You have somehow made an ordinary day feel special.',
  'Are you a star map? Because I could spend all night studying you.',
  'If confidence were contagious, I would happily catch yours.',
  'Are you a good book? Because I already want to know how your story ends.',
  'You have the kind of energy people remember.',
  'Are you a camera lens? Because you make everything look better.',
  'If curiosity were a crime, you would be my favorite mystery.',
  'Are you a sunset in summer? Because you are hard to ignore.',
  'You must be a rare coincidence because meeting you feels unlikely and lucky.',
  'Are you a melody? Because my mood changes when you arrive.',
  'If attraction were mathematics, you would be an undeniable constant.',
  'Are you a secret? Because I cannot stop wondering about you.',
  'You have a smile that could make a bad day reconsider itself.',
  'Are you a constellation? Because you stand out even in a crowded sky.',
  'If good vibes were electricity, you would power a city.',
  'Are you a favorite destination? Because I never want the journey to end.',
  'You have the kind of presence that makes people look twice.',
  'Are you a sunrise alarm? Because you are the reason I want to wake up.',
  'If elegance were an art, you would be a masterpiece.',
  'Are you a playlist on repeat? Because I cannot get enough of your vibe.',
  'You seem like the plot twist my day needed.',
  'Are you a shooting star? Because meeting you feels rare.',
  'If charm had a blueprint, I think you would be the original design.',
  'Are you a garden? Because there is something effortlessly beautiful about you.',
  'You have the kind of smile that deserves a standing ovation.',
  'Are you a good conversation? Because I already want more.',
  'If chemistry were visible, I think we would have evidence.',
  'Are you a weekend? Because I instantly feel happier around you.',
  'You make ordinary moments feel unexpectedly interesting.',
  'Are you a password? Because you are difficult to forget.',
  'If attraction had a notification sound, mine would be going off right now.',
  'Are you a favorite movie? Because I could watch you forever.',
  'You have an energy that makes introductions feel unnecessary.',
  'Are you a cup of coffee? Because you have my full attention.',
  'If timing is everything, meeting you feels perfectly timed.',
  'Are you a sunrise after a storm? Because you completely changed the atmosphere.',
  'You are the kind of person who makes curiosity feel dangerous.',
  'Are you a rare book? Because I would rather discover you than skim you.',
  'If smiles could start conversations, yours already did.',
  'Are you a good story? Because I want to hear every chapter.',
  'You have the kind of presence that makes silence comfortable.',
  'Are you a constellation? Because somehow you became the brightest thing in view.',
  'If first impressions matter, you just made mine unforgettable.'
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/* --------------------------------- assets --------------------------------- */

const ASSETS = path.join(__dirname, '..', '..', 'assets');

function asset(name) {
  const file = path.join(ASSETS, name);
  try {
    return fs.existsSync(file) ? fs.readFileSync(file) : null;
  } catch {
    return null;
  }
}

/** Sends a truth / dare card image with the question as the caption. */
async function sendCard(ctx, kind, text) {
  const file = kind === 'truth' ? 'truth.jpg' : 'dare.jpg';
  const emoji = kind === 'truth' ? '🤍' : '🔥';
  const caption = formatter.panel([`${emoji} ${text}`], kind.toUpperCase());
  const image = asset(file);
  if (image) return ctx.reply({ image, caption });
  return ctx.reply(caption);
}

/* ------------------------------- tictactoe -------------------------------- */

const games = new Map(); // chatJid -> game

function renderBoard(board) {
  const symbols = board.map((cell, index) => (cell === null ? String(index + 1) : cell));
  return [
    `│ ${symbols[0]} │ ${symbols[1]} │ ${symbols[2]} │`,
    '├───┼───┼───┤',
    `│ ${symbols[3]} │ ${symbols[4]} │ ${symbols[5]} │`,
    '├───┼───┼───┤',
    `│ ${symbols[6]} │ ${symbols[7]} │ ${symbols[8]} │`,
  ].join('\n');
}

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function winnerOf(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
  }
  return board.every(Boolean) ? 'draw' : null;
}

module.exports = [
  {
    name: 'tictactoe',
    aliases: ['ttt'],
    category: 'fun',
    permission: 'user',
    description: 'Play tic-tac-toe (start, join, move 1-9, cancel)',
    usage: '.tictactoe start | join | 1-9 | cancel | board',
    handler: async (ctx) => {
      const action = (ctx.args[0] || 'board').toLowerCase();
      const game = games.get(ctx.chat);

      if (action === 'start') {
        if (game) return ctx.reply(formatter.warn('A game is already running here. Use `.ttt cancel` to stop it.'));
        games.set(ctx.chat, {
          board: Array(9).fill(null),
          players: { X: ctx.sender, O: null },
          turn: 'X',
          startedBy: ctx.sender,
          createdAt: Date.now(),
        });
        return ctx.reply(
          formatter.panel(['❎ Player X joined', '⭕ Waiting for player O', 'Type `.ttt join` to play'], 'TIC TAC TOE'),
        );
      }

      if (!game) return ctx.reply(formatter.warn('No active game. Start one with `.ttt start`.'));

      if (action === 'cancel') {
        if (ctx.sender !== game.startedBy && !ctx.isSenderAdmin && !ctx.fromMe) {
          return ctx.reply(formatter.error('Only the player who started the game (or an admin) can cancel it.'));
        }
        games.delete(ctx.chat);
        return ctx.reply(formatter.success('Game cancelled.'));
      }

      if (action === 'join') {
        if (game.players.O) return ctx.reply(formatter.warn('This game already has two players.'));
        if (game.players.X === ctx.sender) return ctx.reply(formatter.warn('You are already player X.'));
        game.players.O = ctx.sender;
        return ctx.reply(`${formatter.success('Game started!')}\n\n${renderBoard(game.board)}\n\n❎ turn: @${game.players.X.split('@')[0]}`, {
          mentions: [game.players.X],
        });
      }

      if (action === 'board') {
        return ctx.reply(`${renderBoard(game.board)}\n\nTurn: ${game.turn}`);
      }

      const move = parseInt(action, 10);
      if (!Number.isInteger(move) || move < 1 || move > 9) {
        return ctx.reply(formatter.error('Invalid move. Use a number from 1 to 9.'));
      }
      if (!game.players.O) return ctx.reply(formatter.warn('Waiting for a second player (`.ttt join`).'));

      const symbol = game.players.X === ctx.sender ? 'X' : game.players.O === ctx.sender ? 'O' : null;
      if (!symbol) return ctx.reply(formatter.error('You are not part of this game.'));
      if (symbol !== game.turn) return ctx.reply(formatter.warn('It is not your turn.'));
      if (game.board[move - 1]) return ctx.reply(formatter.error('That cell is already taken.'));

      game.board[move - 1] = symbol;
      const result = winnerOf(game.board);

      if (result === 'draw') {
        games.delete(ctx.chat);
        return ctx.reply(`${renderBoard(game.board)}\n\n🤝 It is a draw!`);
      }
      if (result) {
        const winner = game.players[result];
        games.delete(ctx.chat);
        return ctx.reply(`${renderBoard(game.board)}\n\n🏆 @${winner.split('@')[0]} wins!`, { mentions: [winner] });
      }

      game.turn = symbol === 'X' ? 'O' : 'X';
      const next = game.players[game.turn];
      return ctx.reply(`${renderBoard(game.board)}\n\n${game.turn} turn: @${next.split('@')[0]}`, { mentions: [next] });
    },
  },
  {
    name: 'wcg',
    aliases: ['wordgame', 'wordchain'],
    category: 'fun',
    permission: 'user',
    description: 'Standard word chain game with lobby, turn timer and elimination',
    usage: '.wcg start | join | go | status | cancel',
    handler: async (ctx) => {
      const action = (ctx.args[0] || 'start').toLowerCase();
      if (action === 'join') return wcg.join(ctx);
      if (action === 'go' || action === 'begin') return wcg.forceStart(ctx);
      if (action === 'status') return wcg.status(ctx);
      if (action === 'cancel' || action === 'stop' || action === 'end') return wcg.cancel(ctx);
      return wcg.start(ctx);
    },
  },
  {
    name: 'riddle',
    aliases: [],
    category: 'fun',
    permission: 'user',
    description: 'Get a riddle (the answer follows after 15 seconds)',
    usage: '.riddle',
    handler: async (ctx) => {
      const riddle = pick(RIDDLES);
      await ctx.reply(formatter.panel([`🧠 ${riddle.q}`], 'RIDDLE'));
      const timer = setTimeout(() => {
        ctx.reply(`💡 Answer: ${riddle.a}`).catch(() => {});
      }, 15000);
      timer.unref?.();
    },
  },
  {
    name: 'truthordare',
    aliases: ['tod'],
    category: 'fun',
    permission: 'user',
    description: 'Start a truth or dare round (with picture cards)',
    usage: '.truthordare',
    handler: async (ctx) => {
      const banner = asset('truthordare.jpg');
      const caption = formatter.panel(
        [
          '🎲 *TRUTH OR DARE*',
          'Type `.truth` for a truth card',
          'Type `.dare` for a dare card',
          `📚 ${TRUTHS.length} truths · ${DARES.length} dares loaded`,
        ],
        'TRUTH OR DARE',
      );
      if (banner) return ctx.reply({ image: banner, caption });
      return ctx.reply(caption);
    },
  },
  {
    name: 'truth',
    aliases: [],
    category: 'fun',
    permission: 'user',
    description: 'Random truth question with a TRUTH picture card',
    usage: '.truth',
    handler: async (ctx) => sendCard(ctx, 'truth', pick(TRUTHS)),
  },
  {
    name: 'dare',
    aliases: [],
    category: 'fun',
    permission: 'user',
    description: 'Random dare with a DARE picture card',
    usage: '.dare',
    handler: async (ctx) => sendCard(ctx, 'dare', pick(DARES)),
  },
  {
    name: 'insult',
    aliases: [],
    category: 'fun',
    permission: 'user',
    description: 'Playful roast',
    usage: '.insult [@user]',
    handler: async (ctx) => {
      const target = ctx.mentions[0] || ctx.quoted?.participant;
      const line = pick(INSULTS);
      if (target) return ctx.send({ text: `@${target.split('@')[0]} ${line}`, mentions: [target] });
      return ctx.reply(line);
    },
  },
  {
    name: 'quote',
    aliases: [],
    category: 'fun',
    permission: 'user',
    description: 'Motivational quote',
    usage: '.quote',
    handler: async (ctx) => {
      try {
        const data = await getJson('https://api.quotable.io/random', { timeout: 8000 });
        if (data?.content) return ctx.reply(formatter.panel([`❝ ${data.content} ❞`, `— ${data.author}`], 'QUOTE'));
      } catch {
        /* fall back to the local list */
      }
      const local = pick(QUOTES);
      return ctx.reply(formatter.panel([`❝ ${local.q} ❞`, `— ${local.a}`], 'QUOTE'));
    },
  },
  {
    name: 'joke',
    aliases: [],
    category: 'fun',
    permission: 'user',
    description: 'Random joke',
    usage: '.joke',
    handler: async (ctx) => {
      try {
        const data = await getJson('https://official-joke-api.appspot.com/random_joke', { timeout: 8000 });
        if (data?.setup) return ctx.reply(formatter.panel([`😂 ${data.setup}`, `➡️ ${data.punchline}`], 'JOKE'));
      } catch {
        /* fall back to a local meme line */
      }
      const meme = pick(MEMES);
      return ctx.reply(formatter.panel([`😂 ${meme.top}`, `➡️ ${meme.bottom}`], 'JOKE'));
    },
  },
  {
    name: 'funfact',
    aliases: [],
    category: 'fun',
    permission: 'user',
    description: 'Random fun fact',
    usage: '.funfact',
    handler: async (ctx) => {
      try {
        const data = await getJson('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', { timeout: 8000 });
        if (data?.text) return ctx.reply(formatter.panel([`🧪 ${data.text}`], 'FUN FACT'));
      } catch {
        /* local fallback */
      }
      return ctx.reply(formatter.panel([`🧪 ${pick(FACTS)}`], 'FUN FACT'));
    },
  },
  {
    name: 'fact',
    aliases: [],
    category: 'fun',
    permission: 'user',
    description: `Random fact from the local library (${FACTS.length} facts)`,
    usage: '.fact',
    handler: async (ctx) => ctx.reply(formatter.panel([`📚 ${pick(FACTS)}`], 'FACT')),
  },
  {
    name: 'advice',
    aliases: [],
    category: 'fun',
    permission: 'user',
    description: 'Random advice',
    usage: '.advice',
    handler: async (ctx) => {
      try {
        const data = await getJson('https://api.adviceslip.com/advice', { timeout: 8000 });
        const advice = typeof data === 'string' ? JSON.parse(data)?.slip?.advice : data?.slip?.advice;
        if (advice) return ctx.reply(formatter.panel([`🧭 ${advice}`], 'ADVICE'));
      } catch {
        /* local fallback */
      }
      return ctx.reply(formatter.panel([`🧭 ${pick(ADVICE)}`], 'ADVICE'));
    },
  },
  {
    name: 'meme',
    aliases: [],
    category: 'fun',
    permission: 'user',
    description: 'Random meme image (falls back to the local meme library)',
    usage: '.meme',
    handler: async (ctx) => {
      try {
        const data = await getJson('https://meme-api.com/gimme', { timeout: 12000 });
        if (data?.url) {
          return ctx.reply({
            image: { url: data.url },
            caption: `😹 ${data.title || 'meme'}\nr/${data.subreddit || 'memes'}`,
          });
        }
      } catch {
        /* local fallback below */
      }
      const meme = pick(MEMES);
      return ctx.reply(formatter.panel([`😹 ${meme.top}`, `➡️ ${meme.bottom}`], 'MEME'));
    },
  },
  {
    name: 'textmeme',
    aliases: ['localmeme'],
    category: 'fun',
    permission: 'user',
    description: `Random meme from the offline library (${MEMES.length} memes)`,
    usage: '.textmeme',
    handler: async (ctx) => {
      const meme = pick(MEMES);
      return ctx.reply(formatter.panel([`😹 ${meme.top}`, `➡️ ${meme.bottom}`], 'MEME'));
    },
  },
  {
    name: 'confess',
    aliases: [],
    category: 'fun',
    permission: 'user',
    description: 'Post an anonymous confession into the chat',
    usage: '.confess <text>',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(formatter.error('Write your confession: `.confess I ate the last slice`'));
      if (ctx.argText.length > 700) return ctx.reply(formatter.error('Confession is too long (max 700 characters).'));
      await ctx.sock.sendMessage(ctx.chat, { delete: ctx.key }).catch(() => {});
      return ctx.send(formatter.panel([`🤫 ${ctx.argText}`, '— anonymous'], 'CONFESSION'));
    },
  },
  {
    name: 'pickuplines',
    aliases: ['pickup'],
    category: 'fun',
    permission: 'user',
    description: 'Random pickup line',
    usage: '.pickuplines',
    handler: async (ctx) => ctx.reply(formatter.panel([`💘 ${pick(PICKUP_LINES)}`], 'PICKUP LINE')),
  },
];
