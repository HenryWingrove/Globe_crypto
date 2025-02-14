class Globe {
    constructor(container) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.controls = null;
        this.globe = null;
        this.markers = new Map();
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.tooltip = this.createTooltip();
        this.locationGroups = new Map();
        
        this.init();
        this.setupEventListeners();
    }

    init() {
        // Setup renderer
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // Setup camera
        this.camera.position.z = 200;

        // Add controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.rotateSpeed = 0.5;

        // Create globe
        this.createGlobe();
        this.createStars();
        this.addLights();

        // Start animation
        this.animate();
    }

    createGlobe() {
        // Create the base sphere
        const geometry = new THREE.SphereGeometry(100, 64, 64);
        const material = new THREE.MeshPhongMaterial({
            color: 0x1a1a1a,
            transparent: true,
            opacity: 0.8,
            wireframe: false,
        });
        this.globe = new THREE.Mesh(geometry, material);
        this.scene.add(this.globe);

        // Load and add continent outlines from GeoJSON
        fetch('/api/continents')
            .then(response => response.json())
            .then(geojson => {
                geojson.features.forEach(feature => {
                    if (feature.geometry.type === 'Polygon') {
                        this.addPolygon(feature.geometry.coordinates[0]);
                    } else if (feature.geometry.type === 'MultiPolygon') {
                        feature.geometry.coordinates.forEach(polygon => {
                            this.addPolygon(polygon[0]);
                        });
                    }
                });
            })
            .catch(error => console.error('Error loading continents:', error));

        // Add grid lines
        const gridGeometry = new THREE.SphereGeometry(100.1, 24, 24);
        const gridMaterial = new THREE.MeshBasicMaterial({
            color: 0x444444,
            wireframe: true,
            transparent: true,
            opacity: 0.1,
        });
        const grid = new THREE.Mesh(gridGeometry, gridMaterial);
        this.scene.add(grid);
    }

    createStars() {
        const starsGeometry = new THREE.BufferGeometry();
        const starsMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.5,
        });

        const starsVertices = [];
        for (let i = 0; i < 10000; i++) {
            const x = (Math.random() - 0.5) * 2000;
            const y = (Math.random() - 0.5) * 2000;
            const z = (Math.random() - 0.5) * 2000;
            starsVertices.push(x, y, z);
        }

        starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
        const stars = new THREE.Points(starsGeometry, starsMaterial);
        this.scene.add(stars);
    }

    addLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
        this.scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0xffffff, 1);
        pointLight.position.set(200, 200, 200);
        this.scene.add(pointLight);
    }

    createTooltip() {
        const tooltip = document.createElement('div');
        tooltip.className = 'exchange-tooltip';
        document.body.appendChild(tooltip);
        return tooltip;
    }

    latLongToVector3(lat, lon, radius) {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);

        return new THREE.Vector3(
            -radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.sin(theta)
        );
    }

    addExchange(lat, lon, name, data = {}) {
        const locationKey = `${lat},${lon}`;
        if (!this.locationGroups.has(locationKey)) {
            this.locationGroups.set(locationKey, []);
        }
        const group = this.locationGroups.get(locationKey);
        group.push(name);

        // Calculate a small offset based on position in group
        const index = group.length - 1;
        const angleOffset = (index * Math.PI * 2) / Math.max(8, group.length);
        const distance = 1.5; // Increased offset distance (in degrees) from 0.5 to 1.5

        // Calculate new position with small offset
        const adjustedLon = lon + (Math.cos(angleOffset) * distance);
        const adjustedLat = lat + (Math.sin(angleOffset) * distance);

        const point = this.latLongToVector3(adjustedLat, adjustedLon, 102);
        
        // Create smaller marker
        const markerGeometry = new THREE.SphereGeometry(0.6, 16, 16);
        const markerMaterial = new THREE.MeshPhongMaterial({
            color: 0xFF4B4B,
            emissive: 0xFF4B4B,
            emissiveIntensity: 0.2,
            transparent: true,
            opacity: 0.8
        });
        
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.copy(point);
        marker.userData = { 
            name: name,
            ...data 
        };
        
        this.scene.add(marker);
        this.markers.set(name, marker);
        
        // Add pulse effect
        this.addPulseEffect(point);
    }

    addPulseEffect(position) {
        const pulseGeometry = new THREE.SphereGeometry(1, 16, 16);
        const pulseMaterial = new THREE.MeshBasicMaterial({
            color: 0xff4b4b,
            transparent: true,
            opacity: 1
        });
        
        const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial);
        pulse.position.copy(position);
        
        this.scene.add(pulse);

        // Animate pulse
        const animate = () => {
            pulse.scale.multiplyScalar(1.05);
            pulseMaterial.opacity *= 0.95;

            if (pulseMaterial.opacity > 0.01) {
                requestAnimationFrame(animate);
            } else {
                this.scene.remove(pulse);
                pulse.geometry.dispose();
                pulseMaterial.dispose();
            }
        };
        
        animate();
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.onWindowResize());
        
        this.container.addEventListener('mousemove', (event) => {
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            
            this.checkIntersection();
        });

        this.container.addEventListener('click', (event) => {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(Array.from(this.markers.values()));

            if (intersects.length > 0) {
                const marker = intersects[0].object;
                const exchangeName = marker.userData.name;
                this.onExchangeClick(exchangeName);
            }
        });
    }

    checkIntersection() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(Array.from(this.markers.values()));

        if (intersects.length > 0) {
            const intersection = intersects[0];
            const marker = intersection.object;
            
            this.tooltip.style.display = 'block';
            this.tooltip.style.left = (event.clientX + 10) + 'px';
            this.tooltip.style.top = (event.clientY + 10) + 'px';
            
            const { name, location, price } = marker.userData;
            this.tooltip.innerHTML = `
                <strong>${name}</strong><br>
                ${location}<br>
                ${price ? `Price: $${price.toLocaleString()}` : ''}
            `;
        } else {
            this.tooltip.style.display = 'none';
        }
    }

    updateExchangeData(exchangeName, data) {
        const marker = this.markers.get(exchangeName);
        if (marker) {
            marker.userData = { ...marker.userData, ...data };
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    onExchangeClick(exchangeName) {
        // Dispatch custom event
        const event = new CustomEvent('exchange-selected', { 
            detail: { exchange: exchangeName }
        });
        window.dispatchEvent(event);
    }

    addPolygon(coordinates) {
        const points = [];
        coordinates.forEach(([lon, lat]) => {
            const point = this.latLongToVector3(lat, lon, 101);
            points.push(point);
        });

        const lineGeometry = new THREE.BufferGeometry();
        const positions = [];
        
        for (let i = 0; i < points.length; i++) {
            positions.push(points[i].x, points[i].y, points[i].z);
        }
        
        lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x444444,
            transparent: true,
            opacity: 0.5,
            linewidth: 1
        });
        
        const line = new THREE.Line(lineGeometry, lineMaterial);
        this.scene.add(line);
    }
} 