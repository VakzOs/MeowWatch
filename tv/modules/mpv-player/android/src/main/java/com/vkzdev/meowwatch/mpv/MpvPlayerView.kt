package com.vkzdev.meowwatch.mpv

import android.content.Context
import android.view.SurfaceHolder
import android.view.SurfaceView
import dev.jdtech.mpv.MPVLib
import dev.jdtech.mpv.MPVLib.MpvEvent
import dev.jdtech.mpv.MPVLib.MpvFormat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File

/**
 * Lecteur mpv dans une vue : mpv dessine dans la surface, l'appli lui envoie des commandes et reçoit l'avancement.
 * Toute la logique (pistes, reprise, repères) reste en JavaScript, comme pour l'appli Windows.
 */
class MpvPlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext), MPVLib.EventObserver, SurfaceHolder.Callback {
  private val onLoaded by EventDispatcher()
  private val onProgress by EventDispatcher()
  private val onEnded by EventDispatcher()

  private val mpv = MPVLib.create(context)
  private val surface = SurfaceView(context)
  private var time = 0.0
  private var duration = 0.0
  private var paused = true
  private var lastSent = 0L
  private var pending: Pair<String, Double>? = null // lien demandé avant que la surface existe
  private var attached = false

  init {
    mpv.setOptionString("vo", "gpu")
    mpv.setOptionString("gpu-context", "android")
    mpv.setOptionString("opengl-es", "yes")
    mpv.setOptionString("hwdec", "mediacodec,mediacodec-copy") // décodage par la puce de la télé / du téléphone
    mpv.setOptionString("ao", "audiotrack,opensles")
    mpv.setOptionString("keep-open", "yes")
    mpv.setOptionString("force-window", "no")
    mpv.setOptionString("input-default-bindings", "no")
    mpv.setOptionString("ytdl", "no")
    mpv.setOptionString("sub-auto", "no")
    mpv.setOptionString("sid", "no") // pas de sous-titres d'office : les préférences du profil décident
    mpv.setOptionString("cache", "yes")
    mpv.setOptionString("demuxer-max-bytes", "64MiB")
    // Liens https des debrids : certificats du système Android (mpv n'a pas de magasin à lui).
    caBundle()?.let { mpv.setOptionString("tls-ca-file", it); mpv.setOptionString("tls-verify", "yes") }
    mpv.init()
    for ((name, format) in listOf("time-pos" to MpvFormat.MPV_FORMAT_DOUBLE, "duration" to MpvFormat.MPV_FORMAT_DOUBLE, "pause" to MpvFormat.MPV_FORMAT_FLAG, "eof-reached" to MpvFormat.MPV_FORMAT_FLAG)) mpv.observeProperty(name, format)
    mpv.addObserver(this)
    surface.holder.addCallback(this)
    surface.keepScreenOn = true // pas de mise en veille pendant le film
    addView(surface, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  private fun caBundle(): String? = try {
    val dir = File("/system/etc/security/cacerts")
    val out = File(context.cacheDir, "cacerts.pem")
    if (!out.exists()) out.writeText(dir.listFiles().orEmpty().joinToString("\n") { it.readText() })
    out.absolutePath
  } catch (e: Exception) { null }

  // --- Commandes (appelées depuis JavaScript) ---
  fun load(url: String, start: Double) {
    if (!attached) { pending = url to start; return } // comme mpv-android : on ouvre le fichier une fois la surface prête
    if (start > 0) mpv.setOptionString("start", start.toString()) else mpv.setOptionString("start", "none")
    mpv.command(arrayOf("loadfile", url))
  }
  fun command(args: List<String>) = mpv.command(args.toTypedArray())
  fun set(name: String, value: String) = mpv.setPropertyString(name, value)

  // --- Surface ---
  override fun surfaceCreated(holder: SurfaceHolder) {
    mpv.attachSurface(holder.surface)
    mpv.setOptionString("force-window", "yes")
    mpv.setPropertyString("vo", "gpu")
    attached = true
    pending?.let { (url, start) -> pending = null; load(url, start) }
  }
  override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
    mpv.setPropertyString("android-surface-size", "${width}x$height")
  }
  override fun surfaceDestroyed(holder: SurfaceHolder) {
    attached = false
    mpv.setPropertyString("vo", "null")
    mpv.setOptionString("force-window", "no")
    mpv.detachSurface()
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    mpv.removeObserver(this)
    mpv.destroy()
  }

  // --- Événements de mpv (fil de mpv : renvoyés sur le fil principal) ---
  override fun eventProperty(property: String) {}
  override fun eventProperty(property: String, value: Long) {}
  override fun eventProperty(property: String, value: String) {}
  override fun eventProperty(property: String, value: Double) {
    if (property == "time-pos") time = value else if (property == "duration") duration = value
    val now = System.currentTimeMillis()
    if (now - lastSent > 250) { lastSent = now; progress() }
  }
  override fun eventProperty(property: String, value: Boolean) {
    if (property == "pause") { paused = value; progress() }
    if (property == "eof-reached" && value) post { onEnded(mapOf("reason" to "eof")) }
  }
  override fun event(eventId: Int) {
    when (eventId) {
      MpvEvent.MPV_EVENT_FILE_LOADED -> { val info = describe(); post { onLoaded(info) } }
      MpvEvent.MPV_EVENT_END_FILE -> if (duration <= 0) post { onEnded(mapOf("reason" to "error")) } // fichier jamais ouvert
    }
  }

  private fun progress() = post { onProgress(mapOf("time" to time, "duration" to duration, "paused" to paused)) }

  /** Pistes et chapitres, lus champ par champ (pas de « node » : rien à convertir). */
  private fun describe(): Map<String, Any> {
    val tracks = (0 until (mpv.getPropertyInt("track-list/count") ?: 0)).map { i ->
      val p = "track-list/$i/"
      mapOf(
        "id" to (mpv.getPropertyInt("${p}id") ?: 0), "type" to (mpv.getPropertyString("${p}type") ?: ""),
        "lang" to (mpv.getPropertyString("${p}lang") ?: ""), "title" to (mpv.getPropertyString("${p}title") ?: ""),
        "codec" to (mpv.getPropertyString("${p}codec") ?: ""), "channels" to (mpv.getPropertyInt("${p}demux-channel-count") ?: 0),
        "height" to (mpv.getPropertyInt("${p}demux-h") ?: 0), "selected" to (mpv.getPropertyBoolean("${p}selected") ?: false),
        "forced" to (mpv.getPropertyBoolean("${p}forced") ?: false),
      )
    }
    val chapters = (0 until (mpv.getPropertyInt("chapter-list/count") ?: 0)).map { i ->
      mapOf("title" to (mpv.getPropertyString("chapter-list/$i/title") ?: ""), "start" to (mpv.getPropertyDouble("chapter-list/$i/time") ?: 0.0))
    }
    duration = mpv.getPropertyDouble("duration") ?: duration
    return mapOf("tracks" to tracks, "chapters" to chapters, "duration" to duration)
  }
}
