// The background follows the weather of the focused place at the selected day and hour.
import { $ } from './dom.js';

const SCENES = ['sun', 'night', 'cloud', 'rain', 'storm', 'fog', 'snow'];
let current = '';

export function setScene(scene) {
  if (!SCENES.includes(scene) || scene === current) return;
  const bg = $('#bg');
  SCENES.forEach((s) => bg.classList.remove('s-' + s));
  bg.classList.add('s-' + scene);
  current = scene;
}
export function setCalm(on) { $('#app').classList.toggle('calm', !!on); }
