import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// WebGL Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Scene and Camera
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1000);
camera.position.set(4, 5, 11);

// Orbit Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 5;
controls.maxDistance = 20;
controls.minPolarAngle = 0.5;
controls.maxPolarAngle = 1.5;
controls.autoRotate = false;
controls.target = new THREE.Vector3(0, 1, 0);
controls.update();

// Ground Plane
const groundGeometry = new THREE.PlaneGeometry(20, 20, 32, 32);
groundGeometry.rotateX(-Math.PI / 2);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x555555,
  side: THREE.DoubleSide
});
const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
groundMesh.castShadow = false;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// Spotlight
const spotLight = new THREE.SpotLight(0xffffff, 3000, 100, 0.22, 1);
spotLight.position.set(0, 25, 0);
spotLight.castShadow = true;
spotLight.shadow.bias = -0.0001;
scene.add(spotLight);

// Normal Ranges for Sensor Values
const normalRanges = {
  bloodPressure: { systolicMin: 90, systolicMax: 120, diastolicMin: 60, diastolicMax: 80 },
  oxygenSaturation: { min: 95, max: 100 },
  heartRate: { min: 60, max: 100 },
  glucose: { min: 70, max: 140 }
};

// Reference to the Model
let modelMesh;

// Check if Sensor Data is Within Normal Ranges
function isNormalReading(data) {
  const [systolic, diastolic] = data.bloodPressure.split('/').map(Number);
  const { oxygenSaturation, heartRate, glucose } = data;

  return (
    systolic >= normalRanges.bloodPressure.systolicMin &&
    systolic <= normalRanges.bloodPressure.systolicMax &&
    diastolic >= normalRanges.bloodPressure.diastolicMin &&
    diastolic <= normalRanges.bloodPressure.diastolicMax &&
    oxygenSaturation >= normalRanges.oxygenSaturation.min &&
    oxygenSaturation <= normalRanges.oxygenSaturation.max &&
    heartRate >= normalRanges.heartRate.min &&
    heartRate <= normalRanges.heartRate.max &&
    glucose >= normalRanges.glucose.min &&
    glucose <= normalRanges.glucose.max
  );
}

// Update Model Color Based on Sensor Data
function updateModelColor(isNormal) {
  if (modelMesh) {
    const color = isNormal ? 0xffffff : 0xff0000; // Normal: Gray, Abnormal: Red
    modelMesh.traverse((child) => {
      if (child.isMesh) {
        child.material.color.setHex(color);
      }
    });
  }
}

// Update Data on the Webpage and Model Color
function updateData(data) {
  document.getElementById('blood-pressure').textContent = data.bloodPressure || "-- mmHg";
  document.getElementById('oxygen-saturation').textContent = data.oxygenSaturation || "-- %";
  document.getElementById('heart-rate').textContent = data.heartRate || "-- bpm";
  document.getElementById('glucose').textContent = data.glucose || "-- mg/dL";

  const isNormal = isNormalReading(data);
  updateModelColor(isNormal);
}

// GLTF Model Loader
const loader = new GLTFLoader().setPath('public/millennium_falcon/');
loader.load('scene.gltf', (gltf) => {
  console.log('Loading model');
  modelMesh = gltf.scene;

  modelMesh.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  modelMesh.position.set(0, 1.05, -1);
  scene.add(modelMesh);

  document.getElementById('progress-container').style.display = 'none';
}, (xhr) => {
  console.log(`Loading ${xhr.loaded / xhr.total * 100}%`);
}, (error) => {
  console.error(error);
});

// Window Resize Event
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animate Scene
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();

// Raspberry Pi API URL
const raspberryPiIP = "http://192.168.1.3:5000";

// Fetch Sensor Data
async function fetchData() {
  try {
    const response = await fetch(`${raspberryPiIP}/sensor-data`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    updateData(data);
  } catch (error) {
    console.error("Error fetching data:", error);
    updateData({
      bloodPressure: "Error",
      oxygenSaturation: "Error",
      heartRate: "Error",
      glucose: "Error"
    });
  }
}

// AI Recommendation API URL
const aiRecommendationUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=AIzaSyDydkiKl-49hTOe5HPBpktMpPv-kP9gczg';

// Function to fetch AI recommendations based on sensor data
async function getHealthRecommendation() {
  try {
    const heartRate = document.getElementById('heart-rate').textContent;
    const bloodPressure = document.getElementById('blood-pressure').textContent;
    const oxygenSaturation = document.getElementById('oxygen-saturation').textContent;
    const glucose = document.getElementById('glucose').textContent;

    const sensorReadings = `
        Heart Rate: ${heartRate}, 
        Blood Pressure: ${bloodPressure}, 
        Oxygen Saturation: ${oxygenSaturation}, 
        Glucose: ${glucose}`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: `Based on the following health sensor readings, provide analysis of body condition. Highlight potential abnormalities and recommend remedies. The readings are:\n\n${sensorReadings}`,
            },
          ],
        },
      ],
    };

    const response = await fetch(aiRecommendationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`API error! status: ${response.status}`);
    }

    const data = await response.json();
    const prediction = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No prediction available.';

    // Add the prediction to the scrollable recommendation list
    const recommendationsList = document.getElementById('recommendations-list');
    const newRecommendation = document.createElement('li');
    newRecommendation.textContent = `AI Analysis:\n${prediction}`;
    recommendationsList.appendChild(newRecommendation);
  } catch (error) {
    console.error('Error fetching AI recommendation:', error);
    const recommendationsList = document.getElementById('recommendations-list');
    const newRecommendation = document.createElement('li');
    newRecommendation.textContent = `Error occurred while fetching analysis: ${error.message}`;
    recommendationsList.appendChild(newRecommendation);
  }
}

// Set up event listener for AI recommendations
document.getElementById('get-recommendation-btn').addEventListener('click', getHealthRecommendation);

// Fetch sensor data every 5 seconds
setInterval(fetchData, 5000);










































// import * as THREE from 'three';
// import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// const renderer = new THREE.WebGLRenderer({ antialias: true });
// renderer.outputColorSpace = THREE.SRGBColorSpace;

// renderer.setSize(window.innerWidth, window.innerHeight);
// renderer.setClearColor(0x000000);
// renderer.setPixelRatio(window.devicePixelRatio);

// renderer.shadowMap.enabled = true;
// renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// document.body.appendChild(renderer.domElement);

// const scene = new THREE.Scene();

// const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1000);
// camera.position.set(4, 5, 11);

// const controls = new OrbitControls(camera, renderer.domElement);
// controls.enableDamping = true;
// controls.enablePan = false;
// controls.minDistance = 5;
// controls.maxDistance = 20;
// controls.minPolarAngle = 0.5;
// controls.maxPolarAngle = 1.5;
// controls.autoRotate = false;
// controls.target = new THREE.Vector3(0, 1, 0);
// controls.update();

// const groundGeometry = new THREE.PlaneGeometry(20, 20, 32, 32);
// groundGeometry.rotateX(-Math.PI / 2);
// const groundMaterial = new THREE.MeshStandardMaterial({
//   color: 0x555555,
//   side: THREE.DoubleSide
// });
// const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
// groundMesh.castShadow = false;
// groundMesh.receiveShadow = true;
// scene.add(groundMesh);

// const spotLight = new THREE.SpotLight(0xffffff, 3000, 100, 0.22, 1);
// spotLight.position.set(0, 25, 0);
// spotLight.castShadow = true;
// spotLight.shadow.bias = -0.0001;
// scene.add(spotLight);

// const loader = new GLTFLoader().setPath('public/millennium_falcon/');
// loader.load('scene.gltf', (gltf) => {
//   console.log('loading model');
//   const mesh = gltf.scene;

//   mesh.traverse((child) => {
//     if (child.isMesh) {
//       child.castShadow = true;
//       child.receiveShadow = true;
//     }
//   });

//   mesh.position.set(0, 1.05, -1);
//   scene.add(mesh);

//   document.getElementById('progress-container').style.display = 'none';
// }, (xhr) => {
//   console.log(`loading ${xhr.loaded / xhr.total * 100}%`);
// }, (error) => {
//   console.error(error);
// });

// window.addEventListener('resize', () => {
//   camera.aspect = window.innerWidth / window.innerHeight;
//   camera.updateProjectionMatrix();
//   renderer.setSize(window.innerWidth, window.innerHeight);
// });

// function animate() {
//   requestAnimationFrame(animate);
//   controls.update();
//   renderer.render(scene, camera);
// }

// animate();


// const raspberryPiIP = "http://192.168.1.9:5000";

// // Function to fetch sensor data from the Raspberry Pi
// async function fetchData() {
//     try {
//         const response = await fetch(`${raspberryPiIP}/sensor-data`);
//         if (!response.ok) {
//             throw new Error(`HTTP error! status: ${response.status}`);
//         }
//         const data = await response.json();
//         updateData(data);
//     } catch (error) {
//         console.error("Error fetching data:", error);
//         updateData({
//             bloodPressure: "Error",
//             oxygenSaturation: "Error",
//             heartRate: "Error",
//             glucose: "Error"
//         });
//     }
// }

// // Function to update the data on the webpage
// function updateData(data) {
//     document.getElementById('blood-pressure').textContent = data.bloodPressure || "-- mmHg";
//     document.getElementById('oxygen-saturation').textContent = data.oxygenSaturation || "-- %";
//     document.getElementById('heart-rate').textContent = data.heartRate || "-- bpm";
//     document.getElementById('glucose').textContent = data.glucose || "-- mg/dL";
// }

// // AI Recommendation API URL
// const aiRecommendationUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=AIzaSyDydkiKl-49hTOe5HPBpktMpPv-kP9gczg';

// // Function to fetch AI recommendations based on sensor data
// async function getHealthRecommendation() {
//     try {
//         const heartRate = document.getElementById('heart-rate').textContent;
//         const bloodPressure = document.getElementById('blood-pressure').textContent;
//         const oxygenSaturation = document.getElementById('oxygen-saturation').textContent;
//         const glucose = document.getElementById('glucose').textContent;

//         const sensorReadings = `
//             Heart Rate: ${heartRate}, 
//             Blood Pressure: ${bloodPressure}, 
//             Oxygen Saturation: ${oxygenSaturation}, 
//             Glucose: ${glucose}`;

//         const requestBody = {
//             contents: [
//                 {
//                     parts: [
//                         {
//                             text: `Based on the following health sensor readings, provide a 7-day prediction of body condition in a paragraph for each day. Highlight potential abnormalities and recommend remedies. The readings are:\n\n${sensorReadings}`,
//                         },
//                     ],
//                 },
//             ],
//         };

//         const response = await fetch(aiRecommendationUrl, {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json',
//             },
//             body: JSON.stringify(requestBody),
//         });

//         if (!response.ok) {
//             throw new Error(`API error! status: ${response.status}`);
//         }

//         const data = await response.json();
//         const prediction = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No prediction available.';

//         // Add the prediction to the scrollable recommendation list
//         const recommendationsList = document.getElementById('recommendations-list');
//         const newRecommendation = document.createElement('li');
//         newRecommendation.textContent = `AI 7-Day Prediction:\n${prediction}`;
//         recommendationsList.appendChild(newRecommendation);
//     } catch (error) {
//         console.error('Error fetching AI recommendation:', error);
//         const recommendationsList = document.getElementById('recommendations-list');
//         const newRecommendation = document.createElement('li');
//         newRecommendation.textContent = `Error occurred while fetching prediction: ${error.message}`;
//         recommendationsList.appendChild(newRecommendation);
//     }
// }

// // Set up event listener for AI recommendations
// document.getElementById('get-recommendation-btn').addEventListener('click', getHealthRecommendation);

// // Fetch sensor data every 5 seconds
// setInterval(fetchData, 5000);






































































