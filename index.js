import {
  appendMediaToMessage,
  event_types,
  eventSource,
  formatCharacterAvatar,
  generateQuietPrompt,
  getCharacterAvatar,
  getCurrentChatId,
  getRequestHeaders,
  saveSettingsDebounced,
  substituteParams,
  substituteParamsExtended,
  systemUserName,
  this_chid,
} from "../../../../script.js";
import {
  extension_settings,
  getContext,
  renderExtensionTemplateAsync,
  writeExtensionField,
} from "../../../extensions.js";
import { selected_group } from "../../../group-chats.js";
import {
  debounce,
  deepMerge,
  getBase64Async,
  getCharaFilename,
  initScrollHeight,
  resetScrollHeight,
  saveBase64AsFile,
} from "../../../utils.js";
import { getMessageTimeStamp, humanizedDateTime } from "../../../RossAscends-mods.js";
import { debounce_timeout } from "../../../constants.js";
import { callGenericPopup, POPUP_TYPE } from "../../../popup.js";

const CUSTOM_STOP_EVENT = "rm_sd_stop_generation";

const extensionName = "rm_sd";

const initiators = {
  wand: "wand",
  swipe: "swipe",
};
const defaultPrefix = "best quality, absurdres, aesthetic,";
const defaultNegative =
  "lowres, bad anatomy, bad hands, text, error, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry";
const defaultStyles = [
  {
    name: "Default",
    negative: defaultNegative,
    prefix: defaultPrefix,
  },
];
const placeholderVae = "Automatic";
const defaultSettings = {
  // CFG Scale
  scale_min: 1,
  scale_max: 30,
  scale_step: 0.1,
  scale: 7,

  // Sampler steps
  steps_min: 1,
  steps_max: 150,
  steps_step: 1,
  steps: 20,

  // Scheduler
  scheduler: "normal",

  // Image dimensions (Width & Height)
  dimension_min: 64,
  dimension_max: 2048,
  dimension_step: 64,
  width: 512,
  height: 512,

  prompt_prefix: defaultPrefix,
  negative_prompt: defaultNegative,
  trigger_prompt: "Generate a prompt for Stable Diffusion image generator, describing current scenario",
  sampler: "DDIM",
  model: "",
  vae: "",
  seed: -1,

  // Automatic1111 exclusives
  restore_faces: false,
  enable_hr: false,
  adetailer_face: false,

  // AUTOMATIC1111 settings
  url: "http://localhost:7860",
  auth: "",

  hr_upscaler: "Latent",
  hr_scale: 1.0,
  hr_scale_min: 1.0,
  hr_scale_max: 4.0,
  hr_scale_step: 0.1,
  denoising_strength: 0.7,
  denoising_strength_min: 0.0,
  denoising_strength_max: 1.0,
  denoising_strength_step: 0.01,
  hr_second_pass_steps: 0,
  hr_second_pass_steps_min: 0,
  hr_second_pass_steps_max: 150,
  hr_second_pass_steps_step: 1,

  // CLIP skip
  clip_skip_min: 1,
  clip_skip_max: 12,
  clip_skip_step: 1,
  clip_skip: 1,

  // Reference ControlNet settings
  ref: false,
  ref_weight: 1.0,
  ref_weight_min: 0.0,
  ref_weight_max: 2.0,
  ref_weight_step: 0.05,
  ref_start: 0.0,
  ref_start_min: 0.0,
  ref_start_max: 1.0,
  ref_start_step: 0.1,
  ref_end: 1.0,
  ref_end_min: 0.0,
  ref_end_max: 1.0,
  ref_end_step: 0.1,
  ref_fidelity: 0.5,
  ref_fidelity_min: 0.0,
  ref_fidelity_max: 1.0,
  ref_fidelity_step: 0.1,

  style: "Default",
  styles: defaultStyles,
};
const writePromptFieldsDebounced = debounce(writePromptFields, debounce_timeout.relaxed);
const resolutionOptions = {
  sd_res_512x512: { width: 512, height: 512, name: "512x512 (1:1, icons, profile pictures)" },
  sd_res_600x600: { width: 600, height: 600, name: "600x600 (1:1, icons, profile pictures)" },
  sd_res_512x768: { width: 512, height: 768, name: "512x768 (2:3, vertical character card)" },
  sd_res_768x512: { width: 768, height: 512, name: "768x512 (3:2, horizontal 35-mm movie film)" },
  sd_res_960x540: { width: 960, height: 540, name: "960x540 (16:9, horizontal wallpaper)" },
  sd_res_540x960: { width: 540, height: 960, name: "540x960 (9:16, vertical wallpaper)" },
  sd_res_1920x1088: { width: 1920, height: 1088, name: "1920x1088 (16:9, 1080p, horizontal wallpaper)" },
  sd_res_1088x1920: { width: 1088, height: 1920, name: "1088x1920 (9:16, 1080p, vertical wallpaper)" },
  sd_res_1280x720: { width: 1280, height: 720, name: "1280x720 (16:9, 720p, horizontal wallpaper)" },
  sd_res_720x1280: { width: 720, height: 1280, name: "720x1280 (9:16, 720p, vertical wallpaper)" },
  sd_res_1024x1024: { width: 1024, height: 1024, name: "1024x1024 (1:1, SDXL)" },
  sd_res_1152x896: { width: 1152, height: 896, name: "1152x896 (9:7, SDXL)" },
  sd_res_896x1152: { width: 896, height: 1152, name: "896x1152 (7:9, SDXL)" },
  sd_res_1216x832: { width: 1216, height: 832, name: "1216x832 (19:13, SDXL)" },
  sd_res_832x1216: { width: 832, height: 1216, name: "832x1216 (13:19, SDXL)" },
  sd_res_1344x768: { width: 1344, height: 768, name: "1344x768 (4:3, SDXL)" },
  sd_res_768x1344: { width: 768, height: 1344, name: "768x1344 (3:4, SDXL)" },
  sd_res_1536x640: { width: 1536, height: 640, name: "1536x640 (24:10, SDXL)" },
  sd_res_640x1536: { width: 640, height: 1536, name: "640x1536 (10:24, SDXL)" },
};

function combinePrefixes(str1, str2, macro = "") {
  const process = (s) => s.trim().replace(/^,|,$/g, "").trim();
  if (!str2) {
    return str1;
  }
  str1 = process(str1);
  str2 = process(str2);
  const result = macro && str1.includes(macro) ? str1.replace(macro, str2) : `${str1}, ${str2},`;
  return process(result);
}

function processReply(str) {
  if (!str) {
    return "";
  }
  str = str.replaceAll('"', "");
  str = str.replaceAll("“", "");
  str = str.replaceAll("\n", ", ");
  str = str.normalize("NFD");
  str = str.replace(/[^a-zA-Z0-9.,:_(){}<>[\]\-'|#]+/g, " ");
  str = str.replace(/\s+/g, " ");
  str = str.trim();
  str = str
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x)
    .join(", ");
  return str;
}

function ensureSelectionExists(setting, selector) {
  /** @type {HTMLSelectElement} */
  const selectElement = document.querySelector(selector);
  if (!selectElement) {
    return;
  }
  const options = Array.from(selectElement.options);
  const value = extension_settings[extensionName][setting];
  if (selectElement.selectedOptions.length && !options.some((option) => option.value === value)) {
    extension_settings[extensionName][setting] = selectElement.selectedOptions[0].value;
  }
}

function getClosestKnownResolution() {
  let resolutionId = null;
  let minTotalDiff = Infinity;
  const targetAspect = extension_settings[extensionName].width / extension_settings[extensionName].height;
  const targetResolution = extension_settings[extensionName].width * extension_settings[extensionName].height;
  const diffs = Object.entries(resolutionOptions).map(([id, resolution]) => {
    const aspectDiff = Math.abs(resolution.width / resolution.height - targetAspect) / targetAspect;
    const resolutionDiff = Math.abs(resolution.width * resolution.height - targetResolution) / targetResolution;
    return { id, totalDiff: aspectDiff + resolutionDiff };
  });

  for (const { id, totalDiff } of diffs) {
    if (totalDiff < minTotalDiff) {
      minTotalDiff = totalDiff;
      resolutionId = id;
    }
  }
  return resolutionId;
}

async function adjustElementScrollHeight() {
  if (CSS.supports("field-sizing", "content") || !$(".sd_settings").is(":visible")) {
    return;
  }

  await resetScrollHeight($("#sd_prompt_prefix"));
  await resetScrollHeight($("#sd_negative_prompt"));
  await resetScrollHeight($("#sd_character_prompt"));
  await resetScrollHeight($("#sd_character_negative_prompt"));
  await resetScrollHeight($("#sd_trigger_prompt"));
}

async function loadSettings() {
  extension_settings[extensionName] = extension_settings[extensionName] || {};
  if (Object.keys(extension_settings[extensionName]).length === 0) {
    Object.assign(extension_settings[extensionName], defaultSettings);
  }

  for (const [key, value] of Object.entries(defaultSettings)) {
    if (extension_settings[extensionName][key] === undefined) {
      extension_settings[extensionName][key] = value;
    }
  }

  if (extension_settings[extensionName].character_prompts === undefined) {
    extension_settings[extensionName].character_prompts = {};
  }
  if (extension_settings[extensionName].character_negative_prompts === undefined) {
    extension_settings[extensionName].character_negative_prompts = {};
  }
  if (!Array.isArray(extension_settings[extensionName].styles)) {
    extension_settings[extensionName].styles = defaultStyles;
  }

  $("#sd_url").val(extension_settings[extensionName].url);
  $("#sd_auth").val(extension_settings[extensionName].auth);
  $("#sd_model").val(extension_settings[extensionName].model);
  $("#sd_vae").val(extension_settings[extensionName].vae);
  $("#sd_sampler").val(extension_settings[extensionName].sampler);
  $("#sd_scheduler").val(extension_settings[extensionName].scheduler);
  $("#sd_hr_upscaler").val(extension_settings[extensionName].hr_upscaler);
  $("#sd_steps").val(extension_settings[extensionName].steps).trigger("input");
  $("#sd_scale").val(extension_settings[extensionName].scale).trigger("input");
  $("#sd_width").val(extension_settings[extensionName].width).trigger("input");
  $("#sd_height").val(extension_settings[extensionName].height).trigger("input");
  $("#sd_hr_scale").val(extension_settings[extensionName].hr_scale).trigger("input");
  $("#sd_denoising_strength").val(extension_settings[extensionName].denoising_strength).trigger("input");
  $("#sd_hr_second_pass_steps").val(extension_settings[extensionName].hr_second_pass_steps).trigger("input");
  $("#sd_clip_skip").val(extension_settings[extensionName].clip_skip).trigger("input");
  $("#sd_restore_faces").prop("checked", extension_settings[extensionName].restore_faces);
  $("#sd_enable_hr").prop("checked", extension_settings[extensionName].enable_hr);
  $("#sd_adetailer_face").prop("checked", extension_settings[extensionName].adetailer_face);
  $("#sd_seed").val(extension_settings[extensionName].seed);
  $("#sd_prompt_prefix").val(extension_settings[extensionName].prompt_prefix).trigger("input");
  $("#sd_negative_prompt").val(extension_settings[extensionName].negative_prompt).trigger("input");
  $("#sd_trigger_prompt").val(extension_settings[extensionName].trigger_prompt).trigger("input");
  $("#sd_ref").prop("checked", extension_settings[extensionName].ref);
  $("#sd_ref_weight").val(extension_settings[extensionName].ref_weight);
  $("#sd_ref_weight_value").val(extension_settings[extensionName].ref_weight);
  $("#sd_ref_start").val(extension_settings[extensionName].ref_start);
  $("#sd_ref_start_value").val(extension_settings[extensionName].ref_start);
  $("#sd_ref_end").val(extension_settings[extensionName].ref_end);
  $("#sd_ref_end_value").val(extension_settings[extensionName].ref_end);
  $("#sd_ref_fidelity").val(extension_settings[extensionName].ref_fidelity);
  $("#sd_ref_fidelity_value").val(extension_settings[extensionName].ref_fidelity);

  for (const style of extension_settings[extensionName].styles) {
    const option = document.createElement("option");
    option.value = style.name;
    option.text = style.name;
    option.selected = style.name === extension_settings[extensionName].style;
    $("#sd_style").append(option);
  }

  const resolutionId = getClosestKnownResolution();
  $("#sd_resolution").val(resolutionId).trigger("input");

  await loadSettingOptions();
}

async function loadSettingOptions() {
  return Promise.all([loadSamplers(), loadModels(), loadSchedulers(), loadVaes()]);
}

async function loadSamplers() {
  $("#sd_sampler").empty();
  let samplers = [];

  if (!extension_settings[extensionName].url) {
    return [];
  }

  try {
    const result = await fetch("/api/sd/samplers", {
      method: "POST",
      headers: getRequestHeaders(),
      body: JSON.stringify(getRequestBody()),
    });
    if (!result.ok) {
      throw new Error("SD WebUI returned an error.");
    }
    samplers = await result.json();
  } catch (error) {
    samplers = [];
  }

  for (const sampler of samplers) {
    const option = document.createElement("option");
    option.innerText = sampler;
    option.value = sampler;
    option.selected = sampler === extension_settings[extensionName].sampler;
    $("#sd_sampler").append(option);
  }

  if (!extension_settings[extensionName].sampler && samplers.length > 0) {
    extension_settings[extensionName].sampler = samplers[0];
    $("#sd_sampler").val(extension_settings[extensionName].sampler).trigger("change");
  }
}

async function loadModels() {
  $("#sd_model").empty();
  let models = [];

  if (!extension_settings[extensionName].url) {
    return [];
  }

  try {
    const result = await fetch("/api/sd/models", {
      method: "POST",
      headers: getRequestHeaders(),
      body: JSON.stringify(getRequestBody()),
    });

    if (!result.ok) {
      throw new Error("SD WebUI returned an error.");
    }

    const upscalers = await getRemoteUpscalers();
    if (Array.isArray(upscalers) && upscalers.length > 0) {
      $("#sd_hr_upscaler").empty();

      for (const upscaler of upscalers) {
        const option = document.createElement("option");
        option.innerText = upscaler;
        option.value = upscaler;
        option.selected = upscaler === extension_settings[extensionName].hr_upscaler;
        $("#sd_hr_upscaler").append(option);
      }
    }
    models = await result.json();
  } catch (error) {
    models = [];
  }

  for (const model of models) {
    const option = document.createElement("option");
    option.innerText = model.text;
    option.value = model.value;
    option.selected = model.value === extension_settings[extensionName].model;
    $("#sd_model").append(option);
  }
  if (!extension_settings[extensionName].model && models.length > 0) {
    extension_settings[extensionName].model = models[0].value;
    $("#sd_model").val(extension_settings[extensionName].model).trigger("change");
  }
}

async function loadSchedulers() {
  $("#sd_scheduler").empty();
  let schedulers = [];

  try {
    const result = await fetch("/api/sd/schedulers", {
      method: "POST",
      headers: getRequestHeaders(),
      body: JSON.stringify(getRequestBody()),
    });

    if (!result.ok) {
      throw new Error("SD WebUI returned an error.");
    }
    schedulers = await result.json();
  } catch (error) {
    console.error(error);
    schedulers = ["N/A"];
  }

  for (const scheduler of schedulers) {
    const option = document.createElement("option");
    option.innerText = scheduler;
    option.value = scheduler;
    option.selected = scheduler === extension_settings[extensionName].scheduler;
    $("#sd_scheduler").append(option);
  }

  if (!extension_settings[extensionName].scheduler && schedulers.length > 0 && schedulers[0] !== "N/A") {
    extension_settings[extensionName].scheduler = schedulers[0];
    $("#sd_scheduler").val(extension_settings[extensionName].scheduler).trigger("change");
  }
}

async function loadVaes() {
  $("#sd_vae").empty();
  let vaes = [];

  if (!extension_settings[extensionName].url) {
    vaes = ["N/A"];
  } else {
    try {
      const result = await fetch("/api/sd/vaes", {
        method: "POST",
        headers: getRequestHeaders(),
        body: JSON.stringify(getRequestBody()),
      });

      if (!result.ok) {
        throw new Error("SD WebUI returned an error.");
      }

      vaes = await result.json();
      Array.isArray(vaes) && vaes.unshift(placeholderVae);
    } catch (error) {
      vaes = ["N/A"];
    }
  }

  for (const vae of vaes) {
    const option = document.createElement("option");
    option.innerText = vae;
    option.value = vae;
    option.selected = vae === extension_settings[extensionName].vae;
    $("#sd_vae").append(option);
  }

  if (!extension_settings[extensionName].vae && vaes.length > 0 && vaes[0] !== "N/A") {
    extension_settings[extensionName].vae = vaes[0];
    $("#sd_vae").val(extension_settings[extensionName].vae).trigger("change");
  }
}

function getRequestBody() {
  return { url: extension_settings[extensionName].url, auth: extension_settings[extensionName].auth };
}

function getCharacterAvatarUrl() {
  // TODO: Do not remove
  const context = getContext();

  if (context.groupId) {
    const groupMembers = context.groups.find((x) => x.id === context.groupId)?.members;
    const lastMessageAvatar = context.chat?.filter((x) => !x.is_system && !x.is_user)?.slice(-1)[0]?.original_avatar;
    const randomMemberAvatar = Array.isArray(groupMembers)
      ? groupMembers[Math.floor(Math.random() * groupMembers.length)]?.avatar
      : null;
    const avatarToUse = lastMessageAvatar || randomMemberAvatar;
    return formatCharacterAvatar(avatarToUse);
  } else {
    return getCharacterAvatar(context.characterId);
  }
}

async function getRemoteUpscalers() {
  try {
    const result = await fetch("/api/sd/upscalers", {
      method: "POST",
      headers: getRequestHeaders(),
      body: JSON.stringify(getRequestBody()),
    });

    if (!result.ok) {
      throw new Error("SD WebUI returned an error.");
    }

    return await result.json();
  } catch (error) {
    console.error(error);
    return [extension_settings[extensionName].hr_upscaler];
  }
}

async function updateRemoteModel() {
  try {
    const result = await fetch("/api/sd/set-model", {
      method: "POST",
      headers: getRequestHeaders(),
      body: JSON.stringify({ ...getRequestBody(), model: extension_settings[extensionName].model }),
    });

    if (!result.ok) {
      throw new Error("SD WebUI returned an error.");
    }

    console.log("Model successfully updated on SD WebUI remote.");
  } catch (error) {
    console.error(error);
    toastr.error(`Could not update SD WebUI model: ${error.message}`);
  }
}

async function writePromptFields(characterId) {
  const key = getCharaFilename(characterId);
  const promptPrefix = key ? extension_settings[extensionName].character_prompts[key] || "" : "";
  const negativePromptPrefix = key ? extension_settings[extensionName].character_negative_prompts[key] || "" : "";
  const promptObject = {
    positive: promptPrefix,
    negative: negativePromptPrefix,
  };
  await writeExtensionField(characterId, "sd_character_prompt", promptObject);
}

/**
 * Generates a prompt using the main LLM API.
 * @param {string} quietPrompt - The prompt to use for the image generation.
 * @returns {Promise<string>} - A promise that resolves when the prompt generation completes.
 */
async function generatePrompt(quietPrompt) {
  const reply = await generateQuietPrompt(quietPrompt, false, false, null, "User");
  const processedReply = processReply(reply);

  if (!processedReply) {
    toastr.error(
      "Prompt generation produced no text. Make sure you're using a valid instruct template and try again",
      "Image Generation"
    );
    throw new Error("Prompt generation failed.");
  }
  return processedReply;
}

/**
 * Generates an image based on the given trigger word.
 * @param {string} initiator The initiator of the image generation
 * @returns {Promise<string|undefined>} Image path
 * @throws {Error} If the prompt or image generation fails
 */
async function generatePicture(initiator) {
  if (!extension_settings[extensionName].url) {
    toastr.warning("Image generation is not available. Check your settings and try again.");
    return;
  }

  ensureSelectionExists("sampler", "#sd_sampler");
  ensureSelectionExists("model", "#sd_model");

  const quietPrompt = extension_settings[extensionName].trigger_prompt;
  const context = getContext();

  const characterName = context.groupId
    ? context.groups[
        Object.keys(context.groups).filter((x) => context.groups[x].id === context.groupId)[0]
      ]?.id?.toString()
    : context.characters[context.characterId]?.name;

  const abortController = new AbortController();
  const stopButton = document.getElementById("sd_stop");
  let negativePromptPrefix = "";
  let imagePath = "";

  const stopListener = () => abortController.abort("Aborted by user");

  try {
    // generate the text prompt for the image
    const prompt = await generatePrompt(quietPrompt);
    console.log("Processed image prompt:", prompt);

    $(stopButton).show();
    eventSource.once(CUSTOM_STOP_EVENT, stopListener);

    // generate the image
    imagePath = await sendGenerationRequest(
      prompt,
      negativePromptPrefix,
      characterName,
      null,
      initiator,
      abortController.signal
    );
  } catch (err) {
    console.trace(err);
    // errors here are most likely due to text generation failure
    // sendGenerationRequest mostly deals with its own errors
    const reason = err.error?.message || err.message || "Unknown error";
    const errorText = "SD prompt text generation failed. " + reason;
    toastr.error(errorText, "Image Generation");
    throw new Error(errorText);
  } finally {
    $(stopButton).hide();
    eventSource.removeListener(CUSTOM_STOP_EVENT, stopListener);
  }

  return imagePath;
}

/**
 * Sends a request to image generation endpoint and processes the result.
 * @param {string} prompt Prompt to be used for image generation
 * @param {string} additionalNegativePrefix Additional negative prompt to be used for image generation
 * @param {string} characterName Name of the character
 * @param {function} callback Callback function to be called after image generation
 * @param {string} initiator The initiator of the image generation
 * @param {AbortSignal} signal Abort signal to cancel the request
 * @returns
 */
async function sendGenerationRequest(prompt, additionalNegativePrefix, characterName, callback, initiator, signal) {
  let characterPrefix = "";
  let characterNegativePrefix = "";

  if (this_chid !== undefined && !selected_group) {
    const key = getCharaFilename(this_chid);
    if (key) {
      characterPrefix = extension_settings[extensionName].character_prompts[key] || "";
      characterNegativePrefix = extension_settings[extensionName].character_negative_prompts[key] || "";
    }
  }

  const prefix = combinePrefixes(extension_settings[extensionName].prompt_prefix, characterPrefix);
  const negativePrefix = combinePrefixes(extension_settings[extensionName].negative_prompt, characterNegativePrefix);
  const prefixedPrompt = substituteParams(combinePrefixes(prefix, prompt, "{prompt}"));
  const negativePrompt = substituteParams(combinePrefixes(additionalNegativePrefix, negativePrefix));

  let result = { format: "", data: "" };
  const currentChatId = getCurrentChatId();
  try {
    result = await generateImage(prefixedPrompt, negativePrompt, signal);
    if (!result.data) {
      throw new Error("Endpoint did not return image data.");
    }
  } catch (err) {
    console.error("Image generation request error: ", err);
    toastr.error("Image generation failed. Please try again." + "\n\n" + String(err), "Image Generation");
    return;
  }

  if (currentChatId !== getCurrentChatId()) {
    console.warn("Chat changed, aborting SD result saving");
    toastr.warning("Chat changed, generated image discarded.", "Image Generation");
    return;
  }

  const filename = `${characterName}_${humanizedDateTime()}`;
  const base64Image = await saveBase64AsFile(result.data, characterName, filename, result.format);
  callback
    ? await callback(prompt, base64Image, additionalNegativePrefix, initiator, prefixedPrompt)
    : await sendMessage(prompt, base64Image, additionalNegativePrefix, initiator, prefixedPrompt);
  return base64Image;
}

/**
 * Generates an image in SD WebUI API using the provided prompt and configuration settings.
 *
 * @param {string} prompt - The main instruction used to guide the image generation.
 * @param {string} negativePrompt - The instruction used to restrict the image generation.
 * @param {AbortSignal} signal - An AbortSignal object that can be used to cancel the request.
 * @returns {Promise<{format: string, data: string}>} - A promise that resolves when the image generation and processing are complete.
 */
async function generateImage(prompt, negativePrompt, signal) {
  const isValidVae =
    extension_settings[extensionName].vae && !["N/A", placeholderVae].includes(extension_settings[extensionName].vae);
  let payload = {
    ...getRequestBody(),
    prompt: prompt,
    negative_prompt: negativePrompt,
    sampler_name: extension_settings[extensionName].sampler,
    scheduler: extension_settings[extensionName].scheduler,
    steps: extension_settings[extensionName].steps,
    cfg_scale: extension_settings[extensionName].scale,
    width: extension_settings[extensionName].width,
    height: extension_settings[extensionName].height,
    restore_faces: !!extension_settings[extensionName].restore_faces,
    enable_hr: !!extension_settings[extensionName].enable_hr,
    hr_upscaler: extension_settings[extensionName].hr_upscaler,
    hr_scale: extension_settings[extensionName].hr_scale,
    hr_additional_modules: [],
    denoising_strength: extension_settings[extensionName].denoising_strength,
    hr_second_pass_steps: extension_settings[extensionName].hr_second_pass_steps,
    seed: extension_settings[extensionName].seed >= 0 ? extension_settings[extensionName].seed : undefined,
    override_settings: {
      CLIP_stop_at_last_layers: extension_settings[extensionName].clip_skip,
      sd_vae: isValidVae ? extension_settings[extensionName].vae : undefined,
      forge_additional_modules: isValidVae ? [extension_settings[extensionName].vae] : undefined, // For SD Forge
    },
    override_settings_restore_afterwards: true,
    clip_skip: extension_settings[extensionName].clip_skip, // For SD.Next
    save_images: true,
    send_images: true,
    do_not_save_grid: false,
    do_not_save_samples: false,
  };

  // Conditionally add the ADetailer if adetailer_face is enabled
  if (extension_settings[extensionName].adetailer_face) {
    payload = deepMerge(payload, {
      alwayson_scripts: {
        ADetailer: {
          args: [
            true, // ad_enable
            true, // skip_img2img
            {
              ad_model: "face_yolov8n.pt",
            },
          ],
        },
      },
    });
  }

  // Conditionally add the ControlNet if ref is enabled
  if (extension_settings[extensionName].ref) {
    const response = await fetch(getCharacterAvatarUrl());
    if (!response.ok) {
      throw new Error("Could not fetch avatar image.");
    } else {
      const avatarBlob = await response.blob();
      const avatarBase64DataUrl = await getBase64Async(avatarBlob);
      const avatarBase64 = avatarBase64DataUrl.split(",")[1];
      payload = deepMerge(payload, {
        alwayson_scripts: {
          controlnet: {
            args: [
              {
                enabled: true,
                image: JSON.stringify(avatarBase64),
                module: "reference_only",
                weight: extension_settings[extensionName].ref_weight,
                threshold_a: extension_settings[extensionName].ref_fidelity,
                guidance_start: extension_settings[extensionName].ref_start,
                guidance_end: extension_settings[extensionName].ref_end,
              },
            ],
          },
        },
      });
    }
  }

  // Make the fetch call with the payload
  const result = await fetch("/api/sd/generate", {
    method: "POST",
    headers: getRequestHeaders(),
    signal: signal,
    body: JSON.stringify(payload),
  });

  if (result.ok) {
    const data = await result.json();
    return { format: "png", data: data.images[0] };
  } else {
    const text = await result.text();
    throw new Error(text);
  }
}
/**
 * Sends a chat message with the generated image.
 * @param {string} prompt Prompt used for the image generation
 * @param {string} image Base64 encoded image
 * @param {string} additionalNegativePrefix Additional negative prompt used for the image generation
 * @param {string} initiator The initiator of the image generation
 * @param {string} prefixedPrompt Prompt with an attached specific prefix
 */
async function sendMessage(prompt, image, additionalNegativePrefix, initiator, prefixedPrompt) {
  const context = getContext();
  const name = context.groupId ? systemUserName : context.name2;

  const messageText = substituteParamsExtended("{{prompt}}", {
    char: name,
    prompt: prompt,
    prefixedPrompt: prefixedPrompt,
  });
  const message = {
    name: name,
    is_user: false,
    is_system: true,
    send_date: getMessageTimeStamp(),
    mes: messageText,
    extra: {
      image: image,
      title: prompt,
      negative: additionalNegativePrefix,
      inline_image: false,
      image_swipes: [image],
    },
  };
  context.chat.push(message);
  const messageId = context.chat.length - 1;
  await eventSource.emit(event_types.MESSAGE_RECEIVED, messageId, "extension");
  context.addOneMessage(message);
  await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, messageId, "extension");
  await context.saveChat();
}

async function onModelChange() {
  extension_settings[extensionName].model = $("#sd_model").find(":selected").val();
  saveSettingsDebounced();
  toastr.info("Updating remote model...", "Please wait");
  await updateRemoteModel();
  toastr.success("Model successfully loaded!", "Image Generation");
}
async function onVaeChange() {
  extension_settings[extensionName].vae = $("#sd_vae").find(":selected").val();
  saveSettingsDebounced();
}

function onSamplerChange() {
  extension_settings[extensionName].sampler = $("#sd_sampler").find(":selected").val();
  saveSettingsDebounced();
}

function onSchedulerChange() {
  extension_settings[extensionName].scheduler = $("#sd_scheduler").find(":selected").val();
  saveSettingsDebounced();
}

function onResolutionChange() {
  const selectedOption = $("#sd_resolution").val();
  const selectedResolution = resolutionOptions[selectedOption];

  if (!selectedResolution) {
    console.warn(`Could not find resolution option for ${selectedOption}`);
    return;
  }

  $("#sd_height").val(selectedResolution.height).trigger("input");
  $("#sd_width").val(selectedResolution.width).trigger("input");
}

function onHrUpscalerChange() {
  extension_settings[extensionName].hr_upscaler = $("#sd_hr_upscaler").find(":selected").val();
  saveSettingsDebounced();
}

function onScaleInput() {
  extension_settings[extensionName].scale = Number($("#sd_scale").val());
  $("#sd_scale_value").val(extension_settings[extensionName].scale.toFixed(1));
  saveSettingsDebounced();
}

function onStepsInput() {
  extension_settings[extensionName].steps = Number($("#sd_steps").val());
  $("#sd_steps_value").val(extension_settings[extensionName].steps);
  saveSettingsDebounced();
}

function onWidthInput() {
  extension_settings[extensionName].width = Number($("#sd_width").val());
  $("#sd_width_value").val(extension_settings[extensionName].width);
  saveSettingsDebounced();
}

function onHeightInput() {
  extension_settings[extensionName].height = Number($("#sd_height").val());
  $("#sd_height_value").val(extension_settings[extensionName].height);
  saveSettingsDebounced();
}

function onSwapDimensionsClick() {
  const w = extension_settings[extensionName].height;
  const h = extension_settings[extensionName].width;
  extension_settings[extensionName].width = w;
  extension_settings[extensionName].height = h;
  $("#sd_width").val(w).trigger("input");
  $("#sd_height").val(h).trigger("input");
  saveSettingsDebounced();
}

function onHrScaleInput() {
  extension_settings[extensionName].hr_scale = Number($("#sd_hr_scale").val());
  $("#sd_hr_scale_value").val(extension_settings[extensionName].hr_scale.toFixed(1));
  saveSettingsDebounced();
}

function onDenoisingStrengthInput() {
  extension_settings[extensionName].denoising_strength = Number($("#sd_denoising_strength").val());
  $("#sd_denoising_strength_value").val(extension_settings[extensionName].denoising_strength.toFixed(2));
  saveSettingsDebounced();
}

function onHrSecondPassStepsInput() {
  extension_settings[extensionName].hr_second_pass_steps = Number($("#sd_hr_second_pass_steps").val());
  $("#sd_hr_second_pass_steps_value").val(extension_settings[extensionName].hr_second_pass_steps);
  saveSettingsDebounced();
}

function onClipSkipInput() {
  extension_settings[extensionName].clip_skip = Number($("#sd_clip_skip").val());
  $("#sd_clip_skip_value").val(extension_settings[extensionName].clip_skip);
  saveSettingsDebounced();
}

function onSeedInput() {
  extension_settings[extensionName].seed = Number($("#sd_seed").val());
  saveSettingsDebounced();
}

function onRestoreFacesInput() {
  extension_settings[extensionName].restore_faces = !!$(this).prop("checked");
  saveSettingsDebounced();
}

function onHighResFixInput() {
  extension_settings[extensionName].enable_hr = !!$(this).prop("checked");
  saveSettingsDebounced();
}

function onADetailerFaceChange() {
  extension_settings[extensionName].adetailer_face = !!$("#sd_adetailer_face").prop("checked");
  saveSettingsDebounced();
}

async function onPromptPrefixInput() {
  extension_settings[extensionName].prompt_prefix = $("#sd_prompt_prefix").val();
  saveSettingsDebounced();
  if (CSS.supports("field-sizing", "content")) return;
  await resetScrollHeight($(this));
}

async function onNegativePromptInput() {
  extension_settings[extensionName].negative_prompt = $("#sd_negative_prompt").val();
  saveSettingsDebounced();
  if (CSS.supports("field-sizing", "content")) return;
  await resetScrollHeight($(this));
}

async function onTriggerPromptInput() {
  extension_settings[extensionName].trigger_prompt = $("#sd_trigger_prompt").val();
  saveSettingsDebounced();
  if (CSS.supports("field-sizing", "content")) return;
  await resetScrollHeight($(this));
}

async function onCharacterPromptInput() {
  const key = getCharaFilename(this_chid);
  extension_settings[extensionName].character_prompts[key] = $("#sd_character_prompt").val();
  saveSettingsDebounced();
  writePromptFieldsDebounced(this_chid);
  if (CSS.supports("field-sizing", "content")) return;
  await resetScrollHeight($(this));
}

async function onCharacterNegativePromptInput() {
  const key = getCharaFilename(this_chid);
  extension_settings[extensionName].character_negative_prompts[key] = $("#sd_character_negative_prompt").val();
  saveSettingsDebounced();
  writePromptFieldsDebounced(this_chid);
  if (CSS.supports("field-sizing", "content")) return;
  await resetScrollHeight($(this));
}

async function onCharacterPromptShareInput() {
  // Not a valid state to share character prompt
  if (this_chid === undefined || selected_group) {
    return;
  }

  const shouldShare = !!$("#sd_character_prompt_share").prop("checked");
  if (shouldShare) {
    await writePromptFields(this_chid);
  } else {
    await writeExtensionField(this_chid, "sd_character_prompt", null);
  }
}

function onStyleSelect() {
  const selectedStyle = String($("#sd_style").find(":selected").val());
  const styleObject = extension_settings[extensionName].styles.find((x) => x.name === selectedStyle);

  if (!styleObject) {
    console.warn(`Could not find style object for ${selectedStyle}`);
    return;
  }

  $("#sd_prompt_prefix").val(styleObject.prefix).trigger("input");
  $("#sd_negative_prompt").val(styleObject.negative).trigger("input");
  extension_settings[extensionName].style = selectedStyle;
  saveSettingsDebounced();
}

async function onSaveStyleClick() {
  const userInput = await callGenericPopup("Enter style name:", POPUP_TYPE.INPUT);

  if (!userInput) {
    return;
  }

  const name = String(userInput).trim();
  const prefix = String($("#sd_prompt_prefix").val());
  const negative = String($("#sd_negative_prompt").val());

  const existingStyle = extension_settings[extensionName].styles.find((x) => x.name === name);
  if (existingStyle) {
    existingStyle.prefix = prefix;
    existingStyle.negative = negative;
    $("#sd_style").val(name);
    saveSettingsDebounced();
    return;
  }

  const styleObject = {
    name: name,
    prefix: prefix,
    negative: negative,
  };

  extension_settings[extensionName].styles.push(styleObject);
  const option = document.createElement("option");
  option.value = styleObject.name;
  option.text = styleObject.name;
  option.selected = true;
  $("#sd_style").append(option);
  $("#sd_style").val(styleObject.name);
  saveSettingsDebounced();
}

async function onDeleteStyleClick() {
  const selectedStyle = String($("#sd_style").find(":selected").val());
  const styleObject = extension_settings[extensionName].styles.find((x) => x.name === selectedStyle);
  if (!styleObject) {
    return;
  }

  const confirmed = await callGenericPopup(
    `Are you sure you want to delete the style "${selectedStyle}"?`,
    POPUP_TYPE.CONFIRM,
    "",
    { okButton: "Delete", cancelButton: "Cancel" }
  );
  if (!confirmed) {
    return;
  }

  const index = extension_settings[extensionName].styles.indexOf(styleObject);
  if (index === -1) {
    return;
  }

  extension_settings[extensionName].styles.splice(index, 1);
  $("#sd_style").find(`option[value="${selectedStyle}"]`).remove();

  if (extension_settings[extensionName].styles.length > 0) {
    extension_settings[extensionName].style = extension_settings[extensionName].styles[0].name;
    $("#sd_style").val(extension_settings[extensionName].style).trigger("change");
  } else {
    extension_settings[extensionName].style = "";
    $("#sd_prompt_prefix").val("").trigger("input");
    $("#sd_negative_prompt").val("").trigger("input");
    $("#sd_style").val("");
  }

  saveSettingsDebounced();
}

function onUrlInput() {
  extension_settings[extensionName].url = $("#sd_url").val();
  saveSettingsDebounced();
}

function onAuthInput() {
  extension_settings[extensionName].auth = $("#sd_auth").val();
  saveSettingsDebounced();
}

async function validateUrl() {
  try {
    if (!extension_settings[extensionName].url) {
      throw new Error("URL is not set.");
    }

    const result = await fetch("/api/sd/ping", {
      method: "POST",
      headers: getRequestHeaders(),
      body: JSON.stringify(getRequestBody()),
    });

    if (!result.ok) {
      throw new Error("SD WebUI returned an error.");
    }

    await loadSettingOptions();
    toastr.success("SD WebUI API connected.");
  } catch (error) {
    toastr.error(`Could not validate SD WebUI API: ${error.message}`);
  }
}

async function addSDGenButtons() {
  const buttonHtml = await renderExtensionTemplateAsync("third-party/rm-stable-diffusion", "button");
  $("#sd_wand_container").append(buttonHtml);
  $("#sd_start").on("click", () => generatePicture(initiators.wand));
  $("#sd_stop").hide();
  $("#sd_stop").on("click", () => eventSource.emit(CUSTOM_STOP_EVENT));
}

/**
 * Switches an image to the next or previous one in the swipe list.
 * @param {object} args Event arguments
 * @param {any} args.message Message object
 * @param {JQuery<HTMLElement>} args.element Message element
 * @param {string} args.direction Swipe direction
 * @returns {Promise<void>}
 */
async function onImageSwiped({ message, element, direction }) {
  const context = getContext();
  const animationClass = "fa-fade";
  const messageImg = element.find(".mes_img");
  // Current image is already animating
  if (messageImg.hasClass(animationClass)) {
    return;
  }

  const swipes = message?.extra?.image_swipes;
  if (!Array.isArray(swipes)) {
    console.warn("No image swipes found in the message");
    return;
  }

  const currentIndex = swipes.indexOf(message.extra.image);
  if (currentIndex === -1) {
    console.warn("Current image not found in the swipes");
    return;
  }

  // Switch to previous image or wrap around if at the beginning
  if (direction === "left") {
    const newIndex = currentIndex === 0 ? swipes.length - 1 : currentIndex - 1;
    message.extra.image = swipes[newIndex];

    // Update the image in the message
    appendMediaToMessage(message, element, false);
  }

  // Switch to next image or generate a new one if at the end
  if (direction === "right") {
    const newIndex = currentIndex === swipes.length - 1 ? swipes.length : currentIndex + 1;
    if (newIndex === swipes.length) {
      const abortController = new AbortController();
      const swipeControls = element.find(".mes_img_swipes");
      const stopButton = document.getElementById("sd_stop");
      const stopListener = () => abortController.abort("Aborted by user");
      const originalSeed = extension_settings[extensionName].seed;
      extension_settings[extensionName].seed =
        extension_settings[extensionName].seed >= 0 ? Math.round(Math.random() * (Math.pow(2, 32) - 1)) : -1;
      let imagePath = "";

      try {
        $(stopButton).show();
        eventSource.once(CUSTOM_STOP_EVENT, stopListener);
        const callback = () => {};
        const prompt = message.extra.title;
        const negativePromptPrefix = message.extra.negative ? message.extra.negative : "";
        const characterName = context.groupId
          ? context.groups[
              Object.keys(context.groups).filter((x) => context.groups[x].id === context.groupId)[0]
            ]?.id?.toString()
          : context.characters[context.characterId]?.name;

        messageImg.addClass(animationClass);
        swipeControls.hide();
        imagePath = await sendGenerationRequest(
          prompt,
          negativePromptPrefix,
          characterName,
          callback,
          initiators.swipe,
          abortController.signal
        );
      } finally {
        $(stopButton).hide();
        messageImg.removeClass(animationClass);
        swipeControls.show();
        eventSource.removeListener(CUSTOM_STOP_EVENT, stopListener);
        extension_settings[extensionName].seed = originalSeed;
      }

      if (!imagePath) {
        return;
      }

      swipes.push(imagePath);
    }

    message.extra.image = swipes[newIndex];
    appendMediaToMessage(message, element, false);
  }
  await context.saveChat();
}

async function onChatChanged() {
  if (this_chid === undefined || selected_group) {
    $("#sd_character_prompt_block").hide();
    return;
  }

  $("#sd_character_prompt_block").show();

  const key = getCharaFilename(this_chid);
  let characterPrompt = key ? extension_settings[extensionName].character_prompts[key] || "" : "";
  let negativePrompt = key ? extension_settings[extensionName].character_negative_prompts[key] || "" : "";

  const context = getContext();
  const sharedPromptData = context?.characters[this_chid]?.data?.extensions?.sd_character_prompt;
  const hasSharedData = sharedPromptData && typeof sharedPromptData === "object";

  if (typeof sharedPromptData?.positive === "string" && !characterPrompt && sharedPromptData.positive) {
    characterPrompt = sharedPromptData.positive;
    extension_settings[extensionName].character_prompts[key] = characterPrompt;
  }
  if (typeof sharedPromptData?.negative === "string" && !negativePrompt && sharedPromptData.negative) {
    negativePrompt = sharedPromptData.negative;
    extension_settings[extensionName].character_negative_prompts[key] = negativePrompt;
  }

  $("#sd_character_prompt").val(characterPrompt);
  $("#sd_character_negative_prompt").val(negativePrompt);
  $("#sd_character_prompt_share").prop("checked", hasSharedData);
  await adjustElementScrollHeight();
}

function onRefInput() {
  extension_settings[extensionName].ref = !!$(this).prop("checked");
  saveSettingsDebounced();
}

function onRefWeightInput() {
  extension_settings[extensionName].ref_weight = Number($("#sd_ref_weight").val());
  $("#sd_ref_weight_value").val(extension_settings[extensionName].ref_weight.toFixed(1));
  saveSettingsDebounced();
}

function onRefStartInput() {
  extension_settings[extensionName].ref_start = Number($("#sd_ref_start").val());
  $("#sd_ref_start_value").val(extension_settings[extensionName].ref_start.toFixed(1));
  saveSettingsDebounced();
}

function onRefEndInput() {
  extension_settings[extensionName].ref_end = Number($("#sd_ref_end").val());
  $("#sd_ref_end_value").val(extension_settings[extensionName].ref_end.toFixed(1));
  saveSettingsDebounced();
}

function onRefFidelityInput() {
  extension_settings[extensionName].ref_fidelity = Number($("#sd_ref_fidelity").val());
  $("#sd_ref_fidelity_value").val(extension_settings[extensionName].ref_fidelity.toFixed(1));
  saveSettingsDebounced();
}

jQuery(async () => {
  await addSDGenButtons();

  const template = await renderExtensionTemplateAsync("third-party/rm-stable-diffusion", "settings", defaultSettings);
  $("#extensions_settings").append(template);
  $("#sd_scale").on("input", onScaleInput);
  $("#sd_steps").on("input", onStepsInput);
  $("#sd_model").on("change", onModelChange);
  $("#sd_vae").on("change", onVaeChange);
  $("#sd_sampler").on("change", onSamplerChange);
  $("#sd_resolution").on("change", onResolutionChange);
  $("#sd_scheduler").on("change", onSchedulerChange);
  $("#sd_prompt_prefix").on("input", onPromptPrefixInput);
  $("#sd_negative_prompt").on("input", onNegativePromptInput);
  $("#sd_trigger_prompt").on("input", onTriggerPromptInput);
  $("#sd_width").on("input", onWidthInput);
  $("#sd_height").on("input", onHeightInput);
  $("#sd_restore_faces").on("input", onRestoreFacesInput);
  $("#sd_enable_hr").on("input", onHighResFixInput);
  $("#sd_adetailer_face").on("change", onADetailerFaceChange);
  $("#sd_character_prompt").on("input", onCharacterPromptInput);
  $("#sd_character_negative_prompt").on("input", onCharacterNegativePromptInput);
  $("#sd_validate").on("click", validateUrl);
  $("#sd_url").on("input", onUrlInput);
  $("#sd_auth").on("input", onAuthInput);
  $("#sd_hr_upscaler").on("change", onHrUpscalerChange);
  $("#sd_hr_scale").on("input", onHrScaleInput);
  $("#sd_denoising_strength").on("input", onDenoisingStrengthInput);
  $("#sd_hr_second_pass_steps").on("input", onHrSecondPassStepsInput);
  $("#sd_style").on("change", onStyleSelect);
  $("#sd_save_style").on("click", onSaveStyleClick);
  $("#sd_delete_style").on("click", onDeleteStyleClick);
  $("#sd_character_prompt_block").hide();
  $("#sd_clip_skip").on("input", onClipSkipInput);
  $("#sd_seed").on("input", onSeedInput);
  $("#sd_character_prompt_share").on("input", onCharacterPromptShareInput);
  $("#sd_swap_dimensions").on("click", onSwapDimensionsClick);
  $("#sd_ref").on("input", onRefInput);
  $("#sd_ref_weight").on("input", onRefWeightInput);
  $("#sd_ref_start").on("input", onRefStartInput);
  $("#sd_ref_end").on("input", onRefEndInput);
  $("#sd_ref_fidelity").on("input", onRefFidelityInput);

  if (!CSS.supports("field-sizing", "content")) {
    $(".sd_settings .inline-drawer-toggle").on("click", function () {
      initScrollHeight($("#sd_prompt_prefix"));
      initScrollHeight($("#sd_negative_prompt"));
      initScrollHeight($("#sd_character_prompt"));
      initScrollHeight($("#sd_character_negative_prompt"));
      initScrollHeight($("#sd_trigger_prompt"));
    });
  }

  for (const [key, value] of Object.entries(resolutionOptions)) {
    const option = document.createElement("option");
    option.value = key;
    option.text = value.name;
    $("#sd_resolution").append(option);
  }

  eventSource.on(event_types.IMAGE_SWIPED, onImageSwiped);
  eventSource.on(event_types.CHAT_CHANGED, onChatChanged);

  await loadSettings();
  $('body').addClass('sd');
});
