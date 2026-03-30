import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const people = [
  {
    name: "Vedant Chhabra",
    email: "vsavetmedia@gmail.com",
    calendarUrl: "https://calendar.google.com/calendar/appointments/schedules/AcZssZ0-placeholder-vedant",
  },
  {
    name: "Avi Adhikari",
    email: "vsavetmediainc@gmail.com",
    calendarUrl: "https://calendar.google.com/calendar/appointments/schedules/AcZssZ0-placeholder-avi",
  },
];

export default function BookMeeting() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Book a Meeting</h1>
        <p className="text-muted-foreground mt-1">Schedule a meeting with our team.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {people.map((person) => (
          <Card key={person.email} className="flex flex-col">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">{person.name}</CardTitle>
                  <CardDescription>{person.email}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <div className="flex-1 rounded-lg border border-border/50 overflow-hidden bg-background">
                <iframe
                  src={person.calendarUrl}
                  className="w-full h-[500px] border-0"
                  title={`Book a meeting with ${person.name}`}
                />
              </div>
              <Button
                variant="outline"
                className="mt-4 w-full"
                onClick={() => window.open(person.calendarUrl, "_blank")}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in new tab
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
