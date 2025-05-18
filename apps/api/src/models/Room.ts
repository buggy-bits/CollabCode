import mongoose, { Schema, Document } from "mongoose";

export interface IRoom extends Document {
  roomId: string;
  roomName: string;
  createdBy: string;
  language: string;
  isPrivate: boolean;
  password?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RoomSchema = new Schema(
  {
    roomId: {
      type: String,
      unique: true,
      required: true,
    },
    roomName: {
      type: String,
      required: true,
      trim: true,
    },
    createdBy: {
      type: String,
      required: true,
    },
    language: {
      type: String,
      required: true,
      default: "javascript",
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    password: {
      type: String,
      required: function (this: IRoom) {
        return this.isPrivate;
      },
    },
  },
  {
    timestamps: true,
  },
);

// Don't return the password in query results
RoomSchema.set("toJSON", {
  transform: (_, ret) => {
    delete ret.password;
    return ret;
  },
});

export default mongoose.model<IRoom>("Room", RoomSchema);
