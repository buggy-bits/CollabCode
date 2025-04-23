import mongoose, { Schema, Document } from "mongoose";

export interface IRoom extends Document {
  name: string;
  createdBy: string;
  language: string;
  isPrivate: boolean;
  password?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RoomSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    createdBy: { type: String, required: true },
    language: { type: String, default: "javascript" },
    isPrivate: { type: Boolean, default: false },
    password: { type: String },
  },
  { timestamps: true },
);

// Don't return the password in query results
RoomSchema.set("toJSON", {
  transform: (_, ret) => {
    delete ret.password;
    return ret;
  },
});

export default mongoose.model<IRoom>("Room", RoomSchema);
