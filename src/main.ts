import "@fontsource/roboto-mono/400.css";
import "./styles.css";
import App from "./App.svelte";
import { mount } from "svelte";

mount(App, { target: document.getElementById("app")! });
