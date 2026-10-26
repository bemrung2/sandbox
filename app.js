/* The only place that knows both the site and what is in it.
   A new experiment is one import and one more entry in this list. */
import { Lab } from "./core/lab.js";
import travel from "./exp/travel/index.js";

Lab.start([travel]);
