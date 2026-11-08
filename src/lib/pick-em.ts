export type PickEmOption = { label: string } & (
  | { votes: number; voters?: never }
  | { voters: (string | null)[]; votes?: never }
);

export type PickEmWeek = {
  week: number;
  polls: {
    question: string;
    options: PickEmOption[];
  }[];
};

export function pickEmVoteCount(option: PickEmOption) {
  return option.voters?.length ?? option.votes ?? 0;
}

// A null entry counts as one vote without a displayed name.
export const pickEmWeeks: PickEmWeek[] = [
  {
    week: 9,
    polls: [
      {
        question: "Daddymundo vs. HertzTushRentals",
        options: [
          { label: "Daddymundo", voters: ["Taco Man"] },
          { label: "HertzTushRentals", voters: ["Justin", "Dom", "Sakthi", "Navin Chakravarty", "Yugraj Dhillon", null, "Karma is a f**"] },
        ],
      },
      {
        question: "Maye Chase McCooks vs. Puka Me Up to Heaven",
        options: [
          { label: "Maye Chase McCooks", voters: ["Justin", "Navin Chakravarty", null] },
          { label: "Puka Me Up to Heaven", voters: ["Dom", "Sakthi", "Yugraj Dhillon", "Taco Man", "Karma is a f**"] },
        ],
      },
      {
        question: "Brandon Aubrey Sinclair vs. 9671 Camassia Way Go Boom",
        options: [
          { label: "Brandon Aubrey Sinclair", voters: ["Dom", "Sakthi", "Karma is a f**"] },
          { label: "9671 Camassia Way Go Boom", voters: ["Justin", "Navin Chakravarty", "Yugraj Dhillon", null, "Taco Man"] },
        ],
      },
      {
        question: "Im ovulating vs. SWKL",
        options: [
          { label: "Im ovulating", voters: ["Yugraj Dhillon", null, "Taco Man", "Karma is a f**"] },
          { label: "SWKL", voters: ["Justin", "Dom", "Sakthi", "Navin Chakravarty"] },
        ],
      },
      {
        question: "aa3345 vs. Jerry Jones’s Auction",
        options: [
          { label: "aa3345", voters: ["Sakthi", null, "Karma is a f**"] },
          { label: "Jerry Jones’s Auction", voters: ["Justin", "Dom", "Navin Chakravarty", "Yugraj Dhillon", "Taco Man"] },
        ],
      },
      {
        question: "KirK Kousins vs. Chase Brown Kids",
        options: [
          { label: "KirK Kousins", voters: ["Justin", "Sakthi", "Navin Chakravarty", null, "Karma is a f**"] },
          { label: "Chase Brown Kids", voters: ["Dom", "Yugraj Dhillon", "Taco Man"] },
        ],
      },
    ],
  },
];
