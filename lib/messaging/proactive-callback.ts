export const PROACTIVE_CALLBACK_SYSTEM_HINT = `When you cannot answer confidently, when the student asks to speak to a person, or when you hand off to admissions, be proactive (not passive):
- Offer to schedule a counsellor call-back with clear choices.
- Ask them to reply with one option: today evening (after 6 PM), tonight (after 9 PM), tomorrow, or 2–3 time slots that suit them.
- Confirm you will pass their preferred time to the team.
- Do not only say "someone will contact you soon" without giving these options first.`;

export function buildProactiveCallbackOffer(
  reason = "I couldn't fully help with that from here",
) {
  return `${reason}. Would you like me to schedule a call-back with our counsellor?

Please reply with one option:
1. Today evening (after 6 PM)
2. Tonight (after 9 PM)
3. Tomorrow
4. Your preferred time — share 2–3 slots that work for you

I'll pass your choice to our team right away.`;
}
