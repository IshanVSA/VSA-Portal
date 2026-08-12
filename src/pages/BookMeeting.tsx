import { CalendarCheck, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import vedantPhoto from "@/assets/vedant-photo.png?format=webp&quality=80&w=160";
import aviPhoto from "@/assets/avi-photo.jpeg?format=webp&quality=80&w=160";

const people = [
  {
    name: "Vedant Chhabra",
    initials: "VC",
    role: "Founder",
    email: "vsavetmedia@gmail.com",
    description: "Strategic planning, growth initiatives & client success.",
    calendarUrl: "https://calendar.app.google/ZxnqGTX5kbz9939c9",
    gradient: "from-primary to-primary/60",
    photo: vedantPhoto,
    inactive: true,
  },
  {
    name: "Avi Adhikari",
    initials: "AA",
    role: "Co-Founder",
    email: "vsavetmediainc@gmail.com",
    description: "Operations, marketing execution & technical support.",
    calendarUrl: "https://calendar.app.google/a5tNn8E145UNmT7f8",
    gradient: "from-accent to-accent/60",
    photo: aviPhoto,
    inactive: false,
  },
];

export default function BookMeeting() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center px-4 py-10">
      {/* Hero */}
      <div className="text-center max-w-xl mx-auto mb-10 animate-fade-in">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.03em] text-foreground mb-3">
          Book a meeting
        </h1>
        <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
          Schedule a one-on-one session with our team to discuss your clinic's goals, campaigns, or any questions you have.
        </p>
      </div>

      {/* Cards */}
      <div className="grid gap-6 md:grid-cols-2 w-full max-w-3xl stagger-children">
        {people.map((person) => (
          <div
            key={person.email}
            className={`glass-card rounded-2xl p-6 flex flex-col items-center text-center transition-all duration-300 ${
              person.inactive ? "opacity-60 grayscale" : "hover-lift"
            }`}
            aria-disabled={person.inactive}
          >
            {/* Avatar */}
            {person.photo ? (
              <div className="h-20 w-20 rounded-full overflow-hidden mb-4 shadow-lg ring-2 ring-primary/20">
                <img src={person.photo} alt={person.name} width={80} height={80} loading="lazy" decoding="async" className="h-full w-full object-cover object-top" />
              </div>
            ) : (
              <div
                className={`h-20 w-20 rounded-full bg-gradient-to-br ${person.gradient} flex items-center justify-center mb-4 shadow-lg`}
              >
                <span className="text-2xl font-bold text-primary-foreground">
                  {person.initials}
                </span>
              </div>
            )}

            {/* Info */}
            <h2 className="text-xl font-semibold text-foreground">{person.name}</h2>

            <div className="flex items-center gap-1.5 mt-3 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              {person.email}
            </div>

            <p className="text-sm text-muted-foreground mt-3 leading-relaxed max-w-[260px]">
              {person.description}
            </p>

            {/* CTA */}
            <Button
              className="mt-6 w-full"
              disabled={person.inactive}
              onClick={() => !person.inactive && window.open(person.calendarUrl, "_self")}
            >
              <CalendarCheck className="mr-2 h-4 w-4" />
              {person.inactive ? "Currently Unavailable" : "Schedule a Meeting"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
