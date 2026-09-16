import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  nightCheckRoomChecks,
  nightCheckSituationTypes,
  residents,
} from "@/db/schema";
import { ALL_ROOM_NUMBERS, FLOORS } from "@/lib/night-checks";
import { WelfareRoomCard } from "./welfare-room-card";

export async function WelfareSection({
  siteId,
  roundId,
  templateItemId,
  readOnly,
}: {
  siteId: string;
  roundId: string;
  templateItemId: string;
  readOnly: boolean;
}) {
  const db = getDb();

  const [roomChecks, situationTypes, roomResidents] = await Promise.all([
    db.query.nightCheckRoomChecks.findMany({
      where: eq(nightCheckRoomChecks.roundId, roundId),
      with: {
        situations: {
          columns: {},
          with: { situationType: { columns: { id: true, label: true } } },
        },
      },
    }),
    db.query.nightCheckSituationTypes.findMany({
      where: and(
        eq(nightCheckSituationTypes.siteId, siteId),
        eq(nightCheckSituationTypes.active, true),
      ),
      orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.createdAt)],
      columns: { id: true, label: true },
    }),
    db.query.residents.findMany({
      where: and(
        eq(residents.siteId, siteId),
        eq(residents.status, "active"),
        inArray(
          residents.room,
          ALL_ROOM_NUMBERS.map((n) => String(n)),
        ),
      ),
      columns: { room: true, firstName: true, lastName: true, preferredName: true },
    }),
  ]);

  const residentByRoom = new Map(
    roomResidents.map((r) => [r.room, `${r.preferredName ?? r.firstName} ${r.lastName}`]),
  );
  const checkByRoom = new Map(roomChecks.map((rc) => [rc.roomNumber, rc]));

  if (roomChecks.length === 0 && readOnly) {
    return (
      <p className="text-sm text-muted-foreground">
        No room-level detail recorded for this round.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Resident welfare</h2>
      {FLOORS.map((f) => (
        <div key={f.floor} className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Floor {f.floor}
          </h3>
          <div className="space-y-3">
            {f.rooms.map((roomNumber) => {
              const check = checkByRoom.get(roomNumber);
              return (
                <WelfareRoomCard
                  key={roomNumber}
                  roundId={roundId}
                  templateItemId={templateItemId}
                  roomNumber={roomNumber}
                  residentLabel={residentByRoom.get(String(roomNumber)) ?? null}
                  situationTypes={situationTypes}
                  initialSituationIds={
                    check?.situations.map((s) => s.situationType.id) ?? []
                  }
                  initialSituationLabels={
                    check?.situations.map((s) => s.situationType.label) ?? []
                  }
                  initialNote={check?.note ?? null}
                  readOnly={readOnly}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
