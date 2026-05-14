export async function compressImage(file, maxKb = 100, maxDimension = 1200) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Max dimensions to help with compression
                const MAX_WIDTH = maxDimension;
                const MAX_HEIGHT = maxDimension;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Start with good quality WebP
                let quality = 0.9;
                
                const attemptCompression = () => {
                    const dataUrl = canvas.toDataURL('image/webp', quality);
                    const base64str = dataUrl.split(',')[1];
                    const sizeKb = (base64str.length * (3/4)) / 1024;

                    if (sizeKb > maxKb && quality > 0.1) {
                        quality -= 0.1;
                        attemptCompression();
                    } else {
                        // Convert DataURL to Blob to File
                        fetch(dataUrl)
                            .then(res => res.blob())
                            .then(blob => {
                                const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", { type: 'image/webp' });
                                resolve(newFile);
                            });
                    }
                };
                
                attemptCompression();
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
}
