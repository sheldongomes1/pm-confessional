export const GUEST_ROLES: Record<string, string> = {
  "Andrew Chen": "General Partner, a16z",
  "Brian Balfour": "Founder & CEO, Reforge",
  "Casey Winters": "Chief Product Officer, Eventbrite",
  "Deb Liu": "CEO, Ancestry",
  "Elena Verna": "Growth Advisor (ex-SurveyMonkey, Miro)",
  "Gibson Biddle": "Former VP Product, Netflix",
  "Lenny Rachitsky": "Author, Lenny's Newsletter",
  "Marty Cagan": "Founding Partner, SVPG",
  "Shreya Murthy": "Product Leader",
  "Shreyas Doshi": "Former Product Lead, Stripe & Twitter",
};

export function roleFor(guestName: string, company?: string | null): string {
  return GUEST_ROLES[guestName] ?? company ?? "PM Leader";
}
