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
  modules,
  renderExtensionTemplateAsync,
  writeExtensionField,
} from "../../../extensions.js";
import { selected_group } from "../../../group-chats.js";
import {
  debounce,
  deepMerge,
  getCharaFilename,
  initScrollHeight,
  resetScrollHeight,
  saveBase64AsFile,
} from "../../../utils.js";
import { getMessageTimeStamp, humanizedDateTime } from "../../../RossAscends-mods.js";
import { SECRET_KEYS, secret_state } from "../../../secrets.js";
import { debounce_timeout } from "../../../constants.js";
import { callGenericPopup, POPUP_TYPE } from "../../../popup.js";

export { MODULE_NAME };

const MODULE_NAME = "rm_sd";
const CUSTOM_STOP_EVENT = "rm_sd_stop_generation";

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
  sampler: "DDIM",
  model: "",
  vae: "",
  seed: -1,

  // Automatic1111 exclusives
  restore_faces: false,
  enable_hr: false,
  adetailer_face: false,

  // Refine mode
  refine_mode: false,
  interactive_mode: false,
  multimodal_captioning: false,
  snap: false,
  free_extend: false,
  function_tool: false,

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

  style: "Default",
  styles: defaultStyles,
};

const writePromptFieldsDebounced = debounce(writePromptFields, debounce_timeout.relaxed);

function getSDRequestBody() {
  return { url: extension_settings.sd.url, auth: extension_settings.sd.auth };
}

async function loadSettings() {
  // Initialize settings
  if (Object.keys(extension_settings.sd).length === 0) {
    Object.assign(extension_settings.sd, defaultSettings);
  }

  // Insert missing settings
  for (const [key, value] of Object.entries(defaultSettings)) {
    if (extension_settings.sd[key] === undefined) {
      extension_settings.sd[key] = value;
    }
  }

  if (extension_settings.sd.character_prompts === undefined) {
    extension_settings.sd.character_prompts = {};
  }

  if (extension_settings.sd.character_negative_prompts === undefined) {
    extension_settings.sd.character_negative_prompts = {};
  }

  if (!Array.isArray(extension_settings.sd.styles)) {
    extension_settings.sd.styles = defaultStyles;
  }

  $("#sd_scale").val(extension_settings.sd.scale).trigger("input");
  $("#sd_steps").val(extension_settings.sd.steps).trigger("input");
  $("#sd_prompt_prefix").val(extension_settings.sd.prompt_prefix).trigger("input");
  $("#sd_negative_prompt").val(extension_settings.sd.negative_prompt).trigger("input");
  $("#sd_trigger_prompt").val(extension_settings.sd.trigger_prompt).trigger("input");
  $("#sd_width").val(extension_settings.sd.width).trigger("input");
  $("#sd_height").val(extension_settings.sd.height).trigger("input");
  $("#sd_hr_scale").val(extension_settings.sd.hr_scale).trigger("input");
  $("#sd_denoising_strength").val(extension_settings.sd.denoising_strength).trigger("input");
  $("#sd_hr_second_pass_steps").val(extension_settings.sd.hr_second_pass_steps).trigger("input");
  $("#sd_restore_faces").prop("checked", extension_settings.sd.restore_faces);
  $("#sd_enable_hr").prop("checked", extension_settings.sd.enable_hr);
  $("#sd_adetailer_face").prop("checked", extension_settings.sd.adetailer_face);
  $("#sd_url").val(extension_settings.sd.url);
  $("#sd_auth").val(extension_settings.sd.auth);
  $("#sd_clip_skip").val(extension_settings.sd.clip_skip);
  $("#sd_clip_skip_value").val(extension_settings.sd.clip_skip);
  $("#sd_seed").val(extension_settings.sd.seed);

  for (const style of extension_settings.sd.styles) {
    const option = document.createElement("option");
    option.value = style.name;
    option.text = style.name;
    option.selected = style.name === extension_settings.sd.style;
    $("#sd_style").append(option);
  }

  const resolutionId = getClosestKnownResolution();
  $("#sd_resolution").val(resolutionId);

  await loadSettingOptions();
}

/**
 * Find a closest resolution option match for the current width and height.
 */
function getClosestKnownResolution() {
  let resolutionId = null;
  let minTotalDiff = Infinity;

  const targetAspect = extension_settings.sd.width / extension_settings.sd.height;
  const targetResolution = extension_settings.sd.width * extension_settings.sd.height;

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

async function loadSettingOptions() {
  return Promise.all([loadSamplers(), loadModels(), loadSchedulers(), loadVaes()]);
}

function onStyleSelect() {
  const selectedStyle = String($("#sd_style").find(":selected").val());
  const styleObject = extension_settings.sd.styles.find((x) => x.name === selectedStyle);

  if (!styleObject) {
    console.warn(`Could not find style object for ${selectedStyle}`);
    return;
  }

  $("#sd_prompt_prefix").val(styleObject.prefix).trigger("input");
  $("#sd_negative_prompt").val(styleObject.negative).trigger("input");
  extension_settings.sd.style = selectedStyle;
  saveSettingsDebounced();
}

async function onDeleteStyleClick() {
  const selectedStyle = String($("#sd_style").find(":selected").val());
  const styleObject = extension_settings.sd.styles.find((x) => x.name === selectedStyle);

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

  const index = extension_settings.sd.styles.indexOf(styleObject);

  if (index === -1) {
    return;
  }

  extension_settings.sd.styles.splice(index, 1);
  $("#sd_style").find(`option[value="${selectedStyle}"]`).remove();

  if (extension_settings.sd.styles.length > 0) {
    extension_settings.sd.style = extension_settings.sd.styles[0].name;
    $("#sd_style").val(extension_settings.sd.style).trigger("change");
  } else {
    extension_settings.sd.style = "";
    $("#sd_prompt_prefix").val("").trigger("input");
    $("#sd_negative_prompt").val("").trigger("input");
    $("#sd_style").val("");
  }

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

  const existingStyle = extension_settings.sd.styles.find((x) => x.name === name);

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

  extension_settings.sd.styles.push(styleObject);
  const option = document.createElement("option");
  option.value = styleObject.name;
  option.text = styleObject.name;
  option.selected = true;
  $("#sd_style").append(option);
  $("#sd_style").val(styleObject.name);
  saveSettingsDebounced();
}

async function onChatChanged() {
  if (this_chid === undefined || selected_group) {
    $("#sd_character_prompt_block").hide();
    return;
  }

  $("#sd_character_prompt_block").show();

  const key = getCharaFilename(this_chid);
  let characterPrompt = key ? extension_settings.sd.character_prompts[key] || "" : "";
  let negativePrompt = key ? extension_settings.sd.character_negative_prompts[key] || "" : "";

  const context = getContext();
  const sharedPromptData = context?.characters[this_chid]?.data?.extensions?.sd_character_prompt;
  const hasSharedData = sharedPromptData && typeof sharedPromptData === "object";

  if (typeof sharedPromptData?.positive === "string" && !characterPrompt && sharedPromptData.positive) {
    characterPrompt = sharedPromptData.positive;
    extension_settings.sd.character_prompts[key] = characterPrompt;
  }
  if (typeof sharedPromptData?.negative === "string" && !negativePrompt && sharedPromptData.negative) {
    negativePrompt = sharedPromptData.negative;
    extension_settings.sd.character_negative_prompts[key] = negativePrompt;
  }

  $("#sd_character_prompt").val(characterPrompt);
  $("#sd_character_negative_prompt").val(negativePrompt);
  $("#sd_character_prompt_share").prop("checked", hasSharedData);
  await adjustElementScrollHeight();
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

async function onCharacterPromptInput() {
  const key = getCharaFilename(this_chid);
  extension_settings.sd.character_prompts[key] = $("#sd_character_prompt").val();
  saveSettingsDebounced();
  writePromptFieldsDebounced(this_chid);
  if (CSS.supports("field-sizing", "content")) return;
  await resetScrollHeight($(this));
}

async function onCharacterNegativePromptInput() {
  const key = getCharaFilename(this_chid);
  extension_settings.sd.character_negative_prompts[key] = $("#sd_character_negative_prompt").val();
  saveSettingsDebounced();
  writePromptFieldsDebounced(this_chid);
  if (CSS.supports("field-sizing", "content")) return;
  await resetScrollHeight($(this));
}

function getCharacterPrefix() {
  if (this_chid === undefined || selected_group) {
    return "";
  }

  const key = getCharaFilename(this_chid);

  if (key) {
    return extension_settings.sd.character_prompts[key] || "";
  }

  return "";
}

function getCharacterNegativePrefix() {
  if (this_chid === undefined || selected_group) {
    return "";
  }

  const key = getCharaFilename(this_chid);

  if (key) {
    return extension_settings.sd.character_negative_prompts[key] || "";
  }

  return "";
}

/**
 * Combines two prompt prefixes into one.
 * @param {string} str1 Base string
 * @param {string} str2 Secondary string
 * @param {string} macro Macro to replace with the secondary string
 * @returns {string} Combined string with a comma between them
 */
function combinePrefixes(str1, str2, macro = "") {
  // Remove leading/trailing white spaces and commas from the strings
  const process = (s) => s.trim().replace(/^,|,$/g, "").trim();

  if (!str2) {
    return str1;
  }

  str1 = process(str1);
  str2 = process(str2);

  // Combine the strings with a comma between them)
  const result = macro && str1.includes(macro) ? str1.replace(macro, str2) : `${str1}, ${str2},`;
  return process(result);
}

function onClipSkipInput() {
  extension_settings.sd.clip_skip = Number($("#sd_clip_skip").val());
  $("#sd_clip_skip_value").val(extension_settings.sd.clip_skip);
  saveSettingsDebounced();
}

function onSeedInput() {
  extension_settings.sd.seed = Number($("#sd_seed").val());
  saveSettingsDebounced();
}

function onScaleInput() {
  extension_settings.sd.scale = Number($("#sd_scale").val());
  $("#sd_scale_value").val(extension_settings.sd.scale.toFixed(1));
  saveSettingsDebounced();
}

function onStepsInput() {
  extension_settings.sd.steps = Number($("#sd_steps").val());
  $("#sd_steps_value").val(extension_settings.sd.steps);
  saveSettingsDebounced();
}

async function onPromptPrefixInput() {
  extension_settings.sd.prompt_prefix = $("#sd_prompt_prefix").val();
  saveSettingsDebounced();
  if (CSS.supports("field-sizing", "content")) return;
  await resetScrollHeight($(this));
}

async function onNegativePromptInput() {
  extension_settings.sd.negative_prompt = $("#sd_negative_prompt").val();
  saveSettingsDebounced();
  if (CSS.supports("field-sizing", "content")) return;
  await resetScrollHeight($(this));
}

async function onTriggerPromptInput() {
  extension_settings.sd.trigger_prompt = $("#sd_trigger_prompt").val();
  saveSettingsDebounced();
  if (CSS.supports("field-sizing", "content")) return;
  await resetScrollHeight($(this));
}

function onSamplerChange() {
  extension_settings.sd.sampler = $("#sd_sampler").find(":selected").val();
  saveSettingsDebounced();
}

function onADetailerFaceChange() {
  extension_settings.sd.adetailer_face = !!$("#sd_adetailer_face").prop("checked");
  saveSettingsDebounced();
}

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

function onSchedulerChange() {
  extension_settings.sd.scheduler = $("#sd_scheduler").find(":selected").val();
  saveSettingsDebounced();
}

function onWidthInput() {
  extension_settings.sd.width = Number($("#sd_width").val());
  $("#sd_width_value").val(extension_settings.sd.width);
  saveSettingsDebounced();
}

function onHeightInput() {
  extension_settings.sd.height = Number($("#sd_height").val());
  $("#sd_height_value").val(extension_settings.sd.height);
  saveSettingsDebounced();
}

function onSwapDimensionsClick() {
  const w = extension_settings.sd.height;
  const h = extension_settings.sd.width;
  extension_settings.sd.width = w;
  extension_settings.sd.height = h;
  $("#sd_width").val(w).trigger("input");
  $("#sd_height").val(h).trigger("input");
  saveSettingsDebounced();
}

function onRestoreFacesInput() {
  extension_settings.sd.restore_faces = !!$(this).prop("checked");
  saveSettingsDebounced();
}

function onHighResFixInput() {
  extension_settings.sd.enable_hr = !!$(this).prop("checked");
  saveSettingsDebounced();
}

function onUrlInput() {
  extension_settings.sd.url = $("#sd_url").val();
  saveSettingsDebounced();
}

function onAuthInput() {
  extension_settings.sd.auth = $("#sd_auth").val();
  saveSettingsDebounced();
}

function onHrUpscalerChange() {
  extension_settings.sd.hr_upscaler = $("#sd_hr_upscaler").find(":selected").val();
  saveSettingsDebounced();
}

function onHrScaleInput() {
  extension_settings.sd.hr_scale = Number($("#sd_hr_scale").val());
  $("#sd_hr_scale_value").val(extension_settings.sd.hr_scale.toFixed(1));
  saveSettingsDebounced();
}

function onDenoisingStrengthInput() {
  extension_settings.sd.denoising_strength = Number($("#sd_denoising_strength").val());
  $("#sd_denoising_strength_value").val(extension_settings.sd.denoising_strength.toFixed(2));
  saveSettingsDebounced();
}

function onHrSecondPassStepsInput() {
  extension_settings.sd.hr_second_pass_steps = Number($("#sd_hr_second_pass_steps").val());
  $("#sd_hr_second_pass_steps_value").val(extension_settings.sd.hr_second_pass_steps);
  saveSettingsDebounced();
}

async function onModelChange() {
  extension_settings.sd.model = $("#sd_model").find(":selected").val();
  saveSettingsDebounced();
  toastr.info("Updating remote model...", "Please wait");
  await updateAutoRemoteModel();
  toastr.success("Model successfully loaded!", "Image Generation");
}

async function getSDRemoteModel() {
  try {
    const result = await fetch("/api/sd/get-model", {
      method: "POST",
      headers: getRequestHeaders(),
      body: JSON.stringify(getSDRequestBody()),
    });

    if (!result.ok) {
      throw new Error("SD WebUI returned an error.");
    }

    return await result.text();
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function onVaeChange() {
  extension_settings.sd.vae = $("#sd_vae").find(":selected").val();
  saveSettingsDebounced();
}

async function getSDRemoteUpscalers() {
  try {
    const result = await fetch("/api/sd/upscalers", {
      method: "POST",
      headers: getRequestHeaders(),
      body: JSON.stringify(getSDRequestBody()),
    });

    if (!result.ok) {
      throw new Error("SD WebUI returned an error.");
    }

    return await result.json();
  } catch (error) {
    console.error(error);
    return [extension_settings.sd.hr_upscaler];
  }
}

async function getSDRemoteSchedulers() {
  try {
    const result = await fetch("/api/sd/schedulers", {
      method: "POST",
      headers: getRequestHeaders(),
      body: JSON.stringify(getSDRequestBody()),
    });

    if (!result.ok) {
      throw new Error("SD WebUI returned an error.");
    }

    return await result.json();
  } catch (error) {
    console.error(error);
    return ["N/A"];
  }
}

async function updateAutoRemoteModel() {
  try {
    const result = await fetch("/api/sd/set-model", {
      method: "POST",
      headers: getRequestHeaders(),
      body: JSON.stringify({ ...getSDRequestBody(), model: extension_settings.sd.model }),
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

async function loadSamplers() {
  $("#sd_sampler").empty();
  let samplers = await loadSDSamplers();

  for (const sampler of samplers) {
    const option = document.createElement("option");
    option.innerText = sampler;
    option.value = sampler;
    option.selected = sampler === extension_settings.sd.sampler;
    $("#sd_sampler").append(option);
  }

  if (!extension_settings.sd.sampler && samplers.length > 0) {
    extension_settings.sd.sampler = samplers[0];
    $("#sd_sampler").val(extension_settings.sd.sampler).trigger("change");
  }
}

async function loadSDSamplers() {
  if (!extension_settings.sd.url) {
    return [];
  }

  try {
    const result = await fetch("/api/sd/samplers", {
      method: "POST",
      headers: getRequestHeaders(),
      body: JSON.stringify(getSDRequestBody()),
    });

    if (!result.ok) {
      throw new Error("SD WebUI returned an error.");
    }

    return await result.json();
  } catch (error) {
    return [];
  }
}

async function loadModels() {
  $("#sd_model").empty();
  let models = await loadSDModels();

  for (const model of models) {
    const option = document.createElement("option");
    option.innerText = model.text;
    option.value = model.value;
    option.selected = model.value === extension_settings.sd.model;
    $("#sd_model").append(option);
  }

  if (!extension_settings.sd.model && models.length > 0) {
    extension_settings.sd.model = models[0].value;
    $("#sd_model").val(extension_settings.sd.model).trigger("change");
  }
}

async function loadSDModels() {
  if (!extension_settings.sd.url) {
    return [];
  }

  try {
    const currentModel = await getSDRemoteModel();

    if (currentModel) {
      extension_settings.sd.model = currentModel;
    }

    const result = await fetch("/api/sd/models", {
      method: "POST",
      headers: getRequestHeaders(),
      body: JSON.stringify(getSDRequestBody()),
    });

    if (!result.ok) {
      throw new Error("SD WebUI returned an error.");
    }

    const upscalers = await getSDRemoteUpscalers();

    if (Array.isArray(upscalers) && upscalers.length > 0) {
      $("#sd_hr_upscaler").empty();

      for (const upscaler of upscalers) {
        const option = document.createElement("option");
        option.innerText = upscaler;
        option.value = upscaler;
        option.selected = upscaler === extension_settings.sd.hr_upscaler;
        $("#sd_hr_upscaler").append(option);
      }
    }

    return await result.json();
  } catch (error) {
    return [];
  }
}

async function loadSchedulers() {
  $("#sd_scheduler").empty();
  let schedulers = await getSDRemoteSchedulers();

  for (const scheduler of schedulers) {
    const option = document.createElement("option");
    option.innerText = scheduler;
    option.value = scheduler;
    option.selected = scheduler === extension_settings.sd.scheduler;
    $("#sd_scheduler").append(option);
  }

  if (!extension_settings.sd.scheduler && schedulers.length > 0 && schedulers[0] !== "N/A") {
    extension_settings.sd.scheduler = schedulers[0];
    $("#sd_scheduler").val(extension_settings.sd.scheduler).trigger("change");
  }
}

async function loadVaes() {
  $("#sd_vae").empty();
  let vaes = await loadSDVaes();

  for (const vae of vaes) {
    const option = document.createElement("option");
    option.innerText = vae;
    option.value = vae;
    option.selected = vae === extension_settings.sd.vae;
    $("#sd_vae").append(option);
  }

  if (!extension_settings.sd.vae && vaes.length > 0 && vaes[0] !== "N/A") {
    extension_settings.sd.vae = vaes[0];
    $("#sd_vae").val(extension_settings.sd.vae).trigger("change");
  }
}

async function loadSDVaes() {
  if (!extension_settings.sd.url) {
    return ["N/A"];
  }

  try {
    const result = await fetch("/api/sd/vaes", {
      method: "POST",
      headers: getRequestHeaders(),
      body: JSON.stringify(getSDRequestBody()),
    });

    if (!result.ok) {
      throw new Error("SD WebUI returned an error.");
    }

    const data = await result.json();
    Array.isArray(data) && data.unshift(placeholderVae);
    return data;
  } catch (error) {
    return ["N/A"];
  }
}

/**
 * Sanitizes generated prompt for image generation.
 * @param {string} str String to process
 * @returns {string} Processed reply
 */
function processReply(str) {
  if (!str) {
    return "";
  }

  str = str.replaceAll('"', "");
  str = str.replaceAll("“", "");
  str = str.replaceAll("\n", ", ");
  str = str.normalize("NFD");

  // Strip out non-alphanumeric characters barring model syntax exceptions
  str = str.replace(/[^a-zA-Z0-9.,:_(){}<>[\]\-'|#]+/g, " ");

  str = str.replace(/\s+/g, " "); // Collapse multiple whitespaces into one
  str = str.trim();

  str = str
    .split(",") // list split by commas
    .map((x) => x.trim()) // trim each entry
    .filter((x) => x) // remove empty entries
    .join(", "); // join it back with proper spacing

  return str;
}

/**
 * Ensure that the selected option exists in the dropdown.
 * @param {string} setting Setting key
 * @param {string} selector Dropdown selector
 * @returns {void}
 */
function ensureSelectionExists(setting, selector) {
  /** @type {HTMLSelectElement} */
  const selectElement = document.querySelector(selector);
  if (!selectElement) {
    return;
  }
  const options = Array.from(selectElement.options);
  const value = extension_settings.sd[setting];
  if (selectElement.selectedOptions.length && !options.some((option) => option.value === value)) {
    extension_settings.sd[setting] = selectElement.selectedOptions[0].value;
  }
}

/**
 * Generates an image based on the given trigger word.
 * @param {string} initiator The initiator of the image generation
 * @returns {Promise<string|undefined>} Image path
 * @throws {Error} If the prompt or image generation fails
 */
async function generatePicture(initiator) {
  if (!extension_settings.sd.url) {
    toastr.warning("Image generation is not available. Check your settings and try again.");
    return;
  }

  ensureSelectionExists("sampler", "#sd_sampler");
  ensureSelectionExists("model", "#sd_model");

  const quietPrompt = extension_settings.sd.trigger_prompt;
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
    const callback = () => {};
    imagePath = await sendGenerationRequest(
      prompt,
      negativePromptPrefix,
      characterName,
      callback,
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

/**
 * Generates a prompt using the main LLM API.
 * @param {string} quietPrompt - The prompt to use for the image generation.
 * @returns {Promise<string>} - A promise that resolves when the prompt generation completes.
 */
async function generatePrompt(quietPrompt) {
  const reply = await generateQuietPrompt(quietPrompt, false, false);
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
 * Sends a request to image generation endpoint and processes the result.
 * @param {number} generationType Type of image generation
 * @param {string} prompt Prompt to be used for image generation
 * @param {string} additionalNegativePrefix Additional negative prompt to be used for image generation
 * @param {string} characterName Name of the character
 * @param {function} callback Callback function to be called after image generation
 * @param {string} initiator The initiator of the image generation
 * @param {AbortSignal} signal Abort signal to cancel the request
 * @returns
 */
async function sendGenerationRequest(prompt, additionalNegativePrefix, characterName, callback, initiator, signal) {
  const prefix = combinePrefixes(extension_settings.sd.prompt_prefix, getCharacterPrefix());
  const negativePrefix = combinePrefixes(extension_settings.sd.negative_prompt, getCharacterNegativePrefix());

  const prefixedPrompt = substituteParams(combinePrefixes(prefix, prompt, "{prompt}"));
  const negativePrompt = substituteParams(combinePrefixes(additionalNegativePrefix, negativePrefix));

  let result = { format: "", data: "" };
  const currentChatId = getCurrentChatId();

  try {
    result = await generateSDImage(prefixedPrompt, negativePrompt, signal);
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
    ? await callback(prompt, base64Image, generationType, additionalNegativePrefix, initiator, prefixedPrompt)
    : await sendMessage(prompt, base64Image, generationType, additionalNegativePrefix, initiator, prefixedPrompt);
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
async function generateSDImage(prompt, negativePrompt, signal) {
  const isValidVae = extension_settings.sd.vae && !["N/A", placeholderVae].includes(extension_settings.sd.vae);
  let payload = {
    ...getSDRequestBody(),
    prompt: prompt,
    negative_prompt: negativePrompt,
    sampler_name: extension_settings.sd.sampler,
    scheduler: extension_settings.sd.scheduler,
    steps: extension_settings.sd.steps,
    cfg_scale: extension_settings.sd.scale,
    width: extension_settings.sd.width,
    height: extension_settings.sd.height,
    restore_faces: !!extension_settings.sd.restore_faces,
    enable_hr: !!extension_settings.sd.enable_hr,
    hr_upscaler: extension_settings.sd.hr_upscaler,
    hr_scale: extension_settings.sd.hr_scale,
    hr_additional_modules: [],
    denoising_strength: extension_settings.sd.denoising_strength,
    hr_second_pass_steps: extension_settings.sd.hr_second_pass_steps,
    seed: extension_settings.sd.seed >= 0 ? extension_settings.sd.seed : undefined,
    override_settings: {
      CLIP_stop_at_last_layers: extension_settings.sd.clip_skip,
      sd_vae: isValidVae ? extension_settings.sd.vae : undefined,
      forge_additional_modules: isValidVae ? [extension_settings.sd.vae] : undefined, // For SD Forge
    },
    override_settings_restore_afterwards: true,
    clip_skip: extension_settings.sd.clip_skip, // For SD.Next
    save_images: true,
    send_images: true,
    do_not_save_grid: false,
    do_not_save_samples: false,
  };

  // Conditionally add the ADetailer if adetailer_face is enabled
  if (extension_settings.sd.adetailer_face) {
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
 * @param {number} generationType Generation type of the image
 * @param {string} additionalNegativePrefix Additional negative prompt used for the image generation
 * @param {string} initiator The initiator of the image generation
 * @param {string} prefixedPrompt Prompt with an attached specific prefix
 */
async function sendMessage(prompt, image, generationType, additionalNegativePrefix, initiator, prefixedPrompt) {
  const context = getContext();
  const name = context.groupId ? systemUserName : context.name2;
  const template = extension_settings.sd.prompts[generationMode.MESSAGE] || "{{prompt}}";
  const messageText = substituteParamsExtended(template, {
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
      generationType: generationType,
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

async function addSDGenButtons() {
  const buttonHtml = await renderExtensionTemplateAsync("third-party/rm-stable-diffusion", "button");
  $("#sd_wand_container").append(buttonHtml);

  $("#sd_start").on("click", () => generatePicture(initiators.wand));

  $("#sd_stop").hide();
  $("#sd_stop").on("click", () => eventSource.emit(CUSTOM_STOP_EVENT));
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

async function writePromptFields(characterId) {
  const key = getCharaFilename(characterId);
  const promptPrefix = key ? extension_settings.sd.character_prompts[key] || "" : "";
  const negativePromptPrefix = key ? extension_settings.sd.character_negative_prompts[key] || "" : "";
  const promptObject = {
    positive: promptPrefix,
    negative: negativePromptPrefix,
  };
  await writeExtensionField(characterId, "sd_character_prompt", promptObject);
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
      const originalSeed = extension_settings.sd.seed;
      extension_settings.sd.seed =
        extension_settings.sd.seed >= 0 ? Math.round(Math.random() * (Math.pow(2, 32) - 1)) : -1;
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
        extension_settings.sd.seed = originalSeed;
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
});
