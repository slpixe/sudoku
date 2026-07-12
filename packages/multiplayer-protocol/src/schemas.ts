import {BASE_COLLECTION_IDS} from "@sudoku/core";
import {z} from "zod";

const cellIndexSchema = z.number().int().min(0).max(80);
const cellValueSchema = z.number().int().min(0).max(9);
const digitSchema = z.number().int().min(1).max(9);
const revisionSchema = z.number().int().nonnegative();
const timestampSchema = z.number().finite().nonnegative();

const notesSchema = z
  .array(digitSchema)
  .max(9)
  .superRefine((notes, context) => {
    if (new Set(notes).size !== notes.length) {
      context.addIssue({code: "custom", message: "Notes must contain unique digits"});
    }
  });

const emptyAction = <Type extends string>(type: Type) => z.object({type: z.literal(type)}).strict();

export const boardActionSchema = z.discriminatedUnion("type", [
  z.object({type: z.literal("setNumber"), cellIndex: cellIndexSchema, number: digitSchema}).strict(),
  z.object({type: z.literal("setNotes"), cellIndex: cellIndexSchema, notes: notesSchema}).strict(),
  z.object({type: z.literal("clearCell"), cellIndex: cellIndexSchema}).strict(),
  z.object({type: z.literal("hint"), cellIndex: cellIndexSchema}).strict(),
]);

export const roomActionSchema = z.discriminatedUnion("type", [
  ...boardActionSchema.options,
  emptyAction("undo"),
  emptyAction("pause"),
  emptyAction("resume"),
  emptyAction("clear"),
]);

export const roomCodeSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/);

export const roomBoardSchema = z
  .object({
    givens: z.array(cellValueSchema).length(81),
    solution: z.array(digitSchema).length(81),
    values: z.array(cellValueSchema).length(81),
    notes: z.array(notesSchema).length(81),
  })
  .strict();

export const roomStatusSchema = z.enum(["running", "paused", "completed"]);

export const roomCommandSchema = z
  .object({
    commandId: z.string().uuid(),
    roomCode: roomCodeSchema,
    baseRevision: revisionSchema,
    action: roomActionSchema,
  })
  .strict();

export const roomSnapshotSchema = z
  .object({
    roomCode: roomCodeSchema,
    collectionId: z.enum(BASE_COLLECTION_IDS),
    puzzleNumber: z.number().int().positive(),
    board: roomBoardSchema,
    revision: revisionSchema,
    status: roomStatusSchema,
    elapsedMs: timestampSchema,
    runningSince: timestampSchema.nullable(),
    serverNow: timestampSchema,
    canUndo: z.boolean(),
    connectedGuests: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    expiresAt: z.string().datetime(),
  })
  .strict();

export const roomEventSchema = z
  .object({
    commandId: z.string().uuid(),
    action: roomActionSchema,
    revision: revisionSchema,
    board: roomBoardSchema,
    status: roomStatusSchema,
    elapsedMs: timestampSchema,
    runningSince: timestampSchema.nullable(),
    serverNow: timestampSchema,
    canUndo: z.boolean(),
  })
  .strict();
