import React from 'react';
import Image from 'next/image';

// Import image assets
import redImage from '../../assets/red.png';
import yellowImage from '../../assets/yellow.png';

interface DecorativePiecesProps {
    isMounted: boolean;
}

const DecorativePieces: React.FC<DecorativePiecesProps> = ({ isMounted }) => {
    if (!isMounted) {
        return null;
    }

    return (
        <>
            <Image
                src={redImage}
                alt="Red decorative piece"
                width={400} // Base width (used for aspect ratio calculation)
                height={400} // Base height (used for aspect ratio calculation)
                className="fixed bottom-0 left-0 w-[30vw] h-auto max-w-[150px] sm:max-w-[250px] md:max-w-[350px] lg:max-w-[400px] transform translate-x-[5%] translate-y-0 z-0 pointer-events-none" // Responsive width, adjusted translate
                priority={false} // Lower priority since they are decorative
            />
            <Image
                src={yellowImage}
                alt="Yellow decorative piece"
                width={400} // Base width
                height={400} // Base height
                className="fixed bottom-0 right-0 w-[30vw] h-auto max-w-[150px] sm:max-w-[250px] md:max-w-[350px] lg:max-w-[400px] transform -translate-x-[5%] translate-y-0 z-0 pointer-events-none" // Responsive width, adjusted translate
                priority={false} // Lower priority
            />
        </>
    );
};

export default DecorativePieces; 