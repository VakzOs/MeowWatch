package com.vkzdev.meowwatch.mpv

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MpvPlayerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MpvPlayer")

    View(MpvPlayerView::class) {
      Events("onLoaded", "onProgress", "onEnded")
      AsyncFunction("load") { view: MpvPlayerView, url: String, start: Double -> view.load(url, start) }
      AsyncFunction("command") { view: MpvPlayerView, args: List<String> -> view.command(args) }
      AsyncFunction("set") { view: MpvPlayerView, name: String, value: String -> view.set(name, value) }
    }
  }
}
