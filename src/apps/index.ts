import type { AppDef } from "../kernel";
import browser from "./browser";
import calculator from "./calculator";
import calendar from "./calendar";
import camera from "./camera";
import clock from "./clock";
import contacts from "./contacts";
import files from "./files";
import gallery from "./gallery";
import maps from "./maps";
import messages from "./messages";
import music from "./music";
import notes from "./notes";
import phone from "./phone";
import recorder from "./recorder";
import settings from "./settings";
import store from "./store";
import weather from "./weather";

/** Every app shipped with the system image. Installing from the store only toggles visibility. */
export const apps: AppDef[] = [browser, calculator, calendar, camera, clock, contacts, files, gallery, maps, messages, music, notes, phone, recorder, settings, store, weather];
